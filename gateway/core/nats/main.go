package nats

import (
	"context"
	"log"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	"go.opentelemetry.io/otel"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

var IsDebug bool = os.Getenv("DEBUG") == "true"
var OTELNatsTracer = otel.Tracer("nats")

type NatsInterface interface {
	Start() error
	DispatchToGlobal(payload UpstreamPayload)   // send a event to a global channel
	DispatchToUpstream(payload UpstreamPayload) // send a event to a service
	RegisterServiceEvent(serviceID string, eventID string)
	UnregisterServiceEvent(serviceID string)

	SetUpstreamTransformer()
	SetDownstreamHandler()
	SetOperationHandler()
}

// registryEntry points an event to the node and service that handle it
// it is shared across the cluster through a KV bucket, so a gateway can
// forward an event when no local service registered it
type registryEntry struct {
	Node    string `json:"node"`
	Service string `json:"service"`
}

type Instance struct {
	Client    *nats.Conn
	Jetstream jetstream.JetStream

	// node that owns this gateway, used to scope directed subjects
	NodeID string

	// cluster wide event registry
	Registry jetstream.KeyValue

	Mutex             sync.RWMutex
	ServicesEventsMap map[string]string
	remoteEvents      map[string]registryEntry
	missingEvents     sync.Map

	UpstreamTransformer func(*UpstreamPayload)
	DownstreamHandler   func(*nats.Msg)
	OperationHandler    func(*nats.Msg)

	natsURL string
}

type UpstreamPayload struct {
	Header nats.Header
	Event  string
	Data   sonic.NoCopyRawMessage
}

type NewManagerOptions struct {
	NatsURL string
	NodeID  string
}

func NewManager(options *NewManagerOptions) *Instance {
	handler := &Instance{
		ServicesEventsMap: make(map[string]string),
		remoteEvents:      make(map[string]registryEntry),
		NodeID:            options.NodeID,
		natsURL:           options.NatsURL,
	}

	return handler
}

func (instance *Instance) Start() error {
	var err error

	connectURL := nats.DefaultURL
	if instance.natsURL != "" {
		connectURL = instance.natsURL
	}

	if instance.Client, err = nats.Connect(connectURL,
		nats.Name("linebridge-gateway"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
		nats.PingInterval(30*time.Second),
		nats.MaxPingsOutstanding(3),
		nats.ReconnectBufSize(16*1024*1024),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			log.Printf("NATS | disconnected: %v", err)
		}),
		nats.ReconnectHandler(func(conn *nats.Conn) {
			log.Printf("NATS | reconnected to %s", conn.ConnectedUrl())
		}),
		nats.ErrorHandler(func(_ *nats.Conn, sub *nats.Subscription, err error) {
			if sub != nil {
				log.Printf("NATS | async error on [%s]: %v", sub.Subject, err)
				return
			}

			log.Printf("NATS | async error: %v", err)
		}),
	); err != nil {
		return err
	}

	log.Printf("NATS connected to %s", connectURL)

	if instance.Jetstream, err = jetstream.New(instance.Client); err != nil {
		return err
	}

	log.Printf("JetStream initialized")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := instance.Jetstream.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "IPC",
		Subjects:  []string{"ipc.>"},
		Storage:   jetstream.MemoryStorage,
		Retention: jetstream.WorkQueuePolicy,
		Discard:   jetstream.DiscardOld,
		MaxAge:    10 * time.Minute,
		MaxMsgs:   100_000,
		MaxBytes:  64 * 1024 * 1024,
		Replicas:  streamReplicas(),
	}); err != nil {
		return err
	}

	// cluster wide event registry, lets a gateway forward an event when no
	// local service registered it
	if instance.Registry, err = instance.Jetstream.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket: "gateway_events",
	}); err != nil {
		return err
	}

	go instance.watchRegistry()

	// start the coroutine to listen downstream & operations
	go instance.StartListeners()

	return nil
}

// streamReplicas returns the number of replicas for the IPC stream, keeping
// the default single replica so a standalone broker keeps working
func streamReplicas() int {
	raw := os.Getenv("NATS_STREAM_REPLICAS")

	if raw == "" {
		return 1
	}

	replicas, err := strconv.Atoi(raw)

	if err != nil || replicas <= 0 {
		log.Printf("NATS | invalid NATS_STREAM_REPLICAS value [%s], using 1", raw)
		return 1
	}

	return replicas
}

func (instance *Instance) StartListeners() {
	if _, err := instance.Client.Subscribe("ipc", instance.HandleIPC); err != nil {
		log.Printf("NATS | failed to subscribe to [ipc]: %v", err)
	}

	// directed operations only reach the node that owns the socket
	if instance.NodeID != "" {
		if _, err := instance.Client.Subscribe("downstream."+instance.NodeID, instance.HandleIPC); err != nil {
			log.Printf("NATS | failed to subscribe to [downstream.%s]: %v", instance.NodeID, err)
		}

		if _, err := instance.Client.Subscribe("operations."+instance.NodeID, instance.HandleOperations); err != nil {
			log.Printf("NATS | failed to subscribe to [operations.%s]: %v", instance.NodeID, err)
		}
	}

	if _, err := instance.Client.Subscribe("operations", instance.HandleOperations); err != nil {
		log.Printf("NATS | failed to subscribe to [operations]: %v", err)
	}
}

func (instance *Instance) RegisterServiceEvent(serviceID string, eventID string) {
	instance.Mutex.Lock()
	instance.ServicesEventsMap[eventID] = serviceID
	instance.Mutex.Unlock()

	instance.publishRegistry(eventID, serviceID)

	log.Printf("NATS | Registered [%s] -> [%s]", eventID, serviceID)
}

// publishRegistry shares the event routing with the rest of the cluster
func (instance *Instance) publishRegistry(eventID string, serviceID string) {
	if instance.Registry == nil {
		return
	}

	payload, err := sonic.Marshal(registryEntry{
		Node:    instance.NodeID,
		Service: serviceID,
	})

	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := instance.Registry.Put(ctx, eventID, payload); err != nil {
		log.Printf("NATS | failed to publish registry for [%s]: %v", eventID, err)
	}
}

// removeRegistry drops the entry only when it belongs to this node
func (instance *Instance) removeRegistry(eventID string) {
	if instance.Registry == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	entry, err := instance.Registry.Get(ctx, eventID)

	if err != nil {
		return
	}

	var data registryEntry

	if err := sonic.Unmarshal(entry.Value(), &data); err != nil {
		return
	}

	if data.Node != instance.NodeID {
		return
	}

	_ = instance.Registry.Delete(ctx, eventID)
}

// watchRegistry keeps the remote event map in sync with the cluster
func (instance *Instance) watchRegistry() {
	if instance.Registry == nil {
		return
	}

	ctx := context.Background()

	watcher, err := instance.Registry.WatchAll(ctx)

	if err != nil {
		log.Printf("NATS | failed to watch event registry: %v", err)
		return
	}

	defer watcher.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case entry, ok := <-watcher.Updates():
			if !ok {
				return
			}

			if entry == nil {
				continue
			}

			instance.handleRegistryEntry(entry)
		}
	}
}

func (instance *Instance) handleRegistryEntry(entry jetstream.KeyValueEntry) {
	switch entry.Operation() {
	case jetstream.KeyValuePut:
		var data registryEntry

		if err := sonic.Unmarshal(entry.Value(), &data); err != nil {
			return
		}

		instance.Mutex.Lock()
		instance.remoteEvents[entry.Key()] = data
		instance.Mutex.Unlock()

	case jetstream.KeyValueDelete, jetstream.KeyValuePurge:
		instance.Mutex.Lock()
		delete(instance.remoteEvents, entry.Key())
		instance.Mutex.Unlock()
	}
}

func (instance *Instance) UnregisterServiceEvent(serviceID string) {
	instance.Mutex.RLock()

	toDelete := make([]string, 0, 20)

	for eventID, sID := range instance.ServicesEventsMap {
		if sID == serviceID {
			toDelete = append(toDelete, eventID)
		}
	}
	instance.Mutex.RUnlock()

	if len(toDelete) == 0 {
		return
	}

	instance.Mutex.Lock()

	for _, eventID := range toDelete {
		if instance.ServicesEventsMap[eventID] == serviceID {
			delete(instance.ServicesEventsMap, eventID)
		}
	}

	instance.Mutex.Unlock()

	log.Printf("NATS | Service [%s] removed. Events cleared: %d", serviceID, len(toDelete))

	for _, eventID := range toDelete {
		instance.removeRegistry(eventID)
	}
}

func (instance *Instance) LookupServiceByEventID(eventID string) (string, bool) {
	instance.Mutex.RLock()
	defer instance.Mutex.RUnlock()

	serviceID, ok := instance.ServicesEventsMap[eventID]

	return serviceID, ok
}

// LookupRemoteServiceByEventID returns the node and service that registered
// an event on another gateway
func (instance *Instance) LookupRemoteServiceByEventID(eventID string) (registryEntry, bool) {
	instance.Mutex.RLock()
	defer instance.Mutex.RUnlock()

	entry, ok := instance.remoteEvents[eventID]

	return entry, ok
}

// logMissingEvent reports an unroutable event once, not on every message
func (instance *Instance) logMissingEvent(event string) {
	if _, loaded := instance.missingEvents.LoadOrStore(event, struct{}{}); loaded {
		return
	}

	log.Printf("NATS | no service registered for event [%s] on node [%s]", event, instance.NodeID)
}

// ServiceEvents returns the events routed to a service through nats
func (instance *Instance) ServiceEvents(serviceID string) []string {
	instance.Mutex.RLock()
	defer instance.Mutex.RUnlock()

	events := make([]string, 0, 8)

	for eventID, sID := range instance.ServicesEventsMap {
		if sID == serviceID {
			events = append(events, eventID)
		}
	}

	sort.Strings(events)

	return events
}

func (instance *Instance) SetUpstreamTransformer(transformer func(*UpstreamPayload)) {
	instance.UpstreamTransformer = transformer
}

func (instance *Instance) SetDownstreamHandler(handler func(*nats.Msg)) {
	instance.DownstreamHandler = handler
}

func (instance *Instance) SetOperationHandler(handler func(*nats.Msg)) {
	instance.OperationHandler = handler
}
