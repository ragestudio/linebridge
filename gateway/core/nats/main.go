package nats

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/bytedance/sonic"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

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

type Instance struct {
	Client    *nats.Conn
	Jetstream jetstream.JetStream

	Mutex             sync.RWMutex
	ServicesEventsMap map[string]string

	UpstreamTransformer func(*UpstreamPayload)
	DownstreamHandler   func(*nats.Msg)
	OperationHandler    func(*nats.Msg)
}

type UpstreamPayload struct {
	Header nats.Header
	Event  string
	Data   sonic.NoCopyRawMessage
}

type NewManagerOptions struct {
}

// TODO: read config from appCfg
func NewManager(options *NewManagerOptions) *Instance {
	handler := &Instance{
		ServicesEventsMap: make(map[string]string),
	}

	return handler
}

func (instance *Instance) Start() error {
	var err error

	if instance.Client, err = nats.Connect(nats.DefaultURL); err != nil {
		return err
	}

	log.Printf("NATS connected")

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
		MaxAge:    24 * time.Hour,
		Replicas:  1,
	}); err != nil {
		return err
	}

	if _, err := instance.Jetstream.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "GLOBAL",
		Subjects:  []string{"global.>"},
		Storage:   jetstream.MemoryStorage,
		Retention: jetstream.WorkQueuePolicy,
		Discard:   jetstream.DiscardOld,
		MaxAge:    24 * time.Hour,
		Replicas:  1,
	}); err != nil {
		return err
	}

	// start the coroutine to listen downstream & operations
	go instance.StartListeners()

	return nil
}

func (instance *Instance) StartListeners() {
	instance.Client.Subscribe("ipc", instance.HandleIPC)
	instance.Client.Subscribe("operations", instance.HandleOperations)
}

func (instance *Instance) RegisterServiceEvent(serviceID string, eventID string) {
	instance.Mutex.Lock()
	instance.ServicesEventsMap[eventID] = serviceID
	instance.Mutex.Unlock()

	log.Printf("NATS | Registered [%s] -> [%s]", eventID, serviceID)
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
	defer instance.Mutex.Unlock()

	for _, eventID := range toDelete {
		if instance.ServicesEventsMap[eventID] == serviceID {
			delete(instance.ServicesEventsMap, eventID)
		}
	}

	log.Printf("NATS | Service [%s] removed. Events cleared: %d", serviceID, len(toDelete))
}

func (instance *Instance) LookupServiceByEventID(eventID string) (string, bool) {
	instance.Mutex.RLock()
	defer instance.Mutex.RUnlock()

	serviceID, ok := instance.ServicesEventsMap[eventID]

	return serviceID, ok
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
