package websocket

import (
	"sync"
	unats "ultragateway/core/nats"
	"ultragateway/core/services"
	"ultragateway/core/websocket/connections"
	"ultragateway/core/websocket/internal_events"
	"ultragateway/core/websocket/nats_operations"

	"github.com/lxzan/event_emitter"
	"github.com/lxzan/gws"
)

type Instance struct {
	Nats           *unats.Instance
	Connections    *connections.ConnectionManager
	Upgrader       *gws.Upgrader
	PubSub         *event_emitter.EventEmitter[string, *nats_operations.PubSubSubscriber]
	NatsOperations map[string]nats_operations.HandlerFunc
	InternalEvents *internal_events.InternalEvents
	Services       *map[string]*services.Service
}

type NewManagerOptions struct {
	Nats     *unats.Instance
	Services *map[string]*services.Service
}

func NewManager(options *NewManagerOptions) *Instance {
	instance := &Instance{
		PubSub:         event_emitter.New[string, *nats_operations.PubSubSubscriber](&event_emitter.Config{}),
		Nats:           options.Nats,
		InternalEvents: &internal_events.InternalEvents{Handlers: &sync.Map{}},
		Services:       options.Services,
	}

	instance.Connections = &connections.ConnectionManager{
		InternalEvents: instance.InternalEvents,
	}

	natsOperations := &nats_operations.Instance{
		PubSub:      instance.PubSub,
		Connections: instance.Connections,
	}

	instance.NatsOperations = map[string]nats_operations.HandlerFunc{
		"subscribeToTopic":    natsOperations.TopicSubscribe,
		"unsubscribeToTopic":  natsOperations.TopicUnsubscribe,
		"findClientsByUserId": natsOperations.FindClientsByUserId,
		"sendToUserId":        natsOperations.SendToUserId,
		"sendToTopic":         natsOperations.SendToTopic,
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

	return instance
}
