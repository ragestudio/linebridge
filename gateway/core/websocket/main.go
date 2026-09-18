package websocket

import (
	"bufio"
	"sync"
	"time"
	unats "ultragateway/core/nats"
	uredis "ultragateway/core/redis"
	"ultragateway/core/services"
	"ultragateway/core/websocket/connections"
	"ultragateway/core/websocket/internal_events"
	"ultragateway/core/websocket/nats_operations"
	"ultragateway/structs"

	"github.com/lxzan/event_emitter"
	"github.com/lxzan/gws"
	"go.opentelemetry.io/otel"
)

var OTELTracer = otel.Tracer("websocket")

const (
	PingInterval     = 25 * time.Second
	PingWait         = 10 * time.Second
	HeartbeatWorkers = 50
)

type Instance struct {
	Nats           *unats.Instance
	Redis          *uredis.Instance
	Connections    *connections.ConnectionManager
	Upgrader       *gws.Upgrader
	PubSub         *event_emitter.EventEmitter[string, *nats_operations.PubSubSubscriber]
	NatsOperations map[string]nats_operations.HandlerFunc
	InternalEvents *internal_events.InternalEvents
	Services       *map[string]*services.Service
	WrapperPool    sync.Pool
	ReaderPool     sync.Pool
}

type NewManagerOptions struct {
	Nats     *unats.Instance
	Redis    *uredis.Instance
	Services *map[string]*services.Service
	Config   *structs.BaseConfig
}

func NewManager(options *NewManagerOptions) *Instance {
	instance := &Instance{
		PubSub:         event_emitter.New[string, *nats_operations.PubSubSubscriber](&event_emitter.Config{}),
		Nats:           options.Nats,
		Redis:          options.Redis,
		InternalEvents: &internal_events.InternalEvents{Handlers: &sync.Map{}},
		Services:       options.Services,
	}

	instance.WrapperPool = sync.Pool{
		New: func() any { return &structs.GwsConnWrapper{} },
	}

	instance.ReaderPool = sync.Pool{
		New: func() any { return bufio.NewReaderSize(nil, 4096) },
	}

	instance.Connections = &connections.ConnectionManager{
		InternalEvents: instance.InternalEvents,
		Config:         options.Config,
	}

	natsOperations := &nats_operations.Instance{
		PubSub:      instance.PubSub,
		Connections: instance.Connections,
	}

	instance.NatsOperations = map[string]nats_operations.HandlerFunc{
		"subscribeToTopic":      natsOperations.TopicSubscribe,
		"unsubscribeToTopic":    natsOperations.TopicUnsubscribe,
		"findClientsByUserId":   natsOperations.FindClientsByUserId,
		"findPresenceByUserIds": natsOperations.FindPresenceByUserIds,
		"sendToUserId":          natsOperations.SendToUserId,
		"sendToTopic":           natsOperations.SendToTopic,
	}

	instance.Upgrader = gws.NewUpgrader(instance, &gws.ServerOption{
		Recovery:        gws.Recovery,
		ParallelEnabled: true,
		PermessageDeflate: gws.PermessageDeflate{
			Enabled: false,
		},
	})

	instance.Nats.SetDownstreamHandler(instance.HandleDownstream)
	instance.Nats.SetOperationHandler(instance.HandleOperation)

	instance.StartHeartbeat()

	return instance
}

func (manager *Instance) StartHeartbeat() {
	ticker := time.NewTicker(PingInterval)
	connCh := make(chan *gws.Conn, 1024)

	jsonBroadcaster := gws.NewBroadcaster(gws.OpcodeText, []byte(`{"event":"ping"}`))
	frameBroadcaster := gws.NewBroadcaster(gws.OpcodePing, nil)

	for range HeartbeatWorkers {
		go func() {
			for conn := range connCh {
				val, ok := conn.Session().Load(structs.WSCtxStoreKey)

				if !ok {
					continue
				}

				connCtx := val.(*structs.WSConnectionCtx)
				now := time.Now().Unix()
				maxAge := int64((PingInterval + PingWait).Seconds())

				if now-connCtx.LastSeen > maxAge {
					conn.WriteClose(1000, []byte(`{ "error": "heartbeat timeout" }`))
					continue
				}

				frameBroadcaster.Broadcast(conn)
				jsonBroadcaster.Broadcast(conn)
			}
		}()
	}

	go func() {
		for range ticker.C {
			manager.Connections.Clients.Range(func(key, value any) bool {
				conn := value.(*gws.Conn)
				connCh <- conn
				return true
			})
		}
	}()
}
