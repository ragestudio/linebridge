package websocket

import (
	unats "ultragateway/core/nats"
	"ultragateway/core/websocket/connections"
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
}

type NewManagerOptions struct {
	Nats *unats.Instance
}

func NewManager(options *NewManagerOptions) *Instance {
	instance := &Instance{
		PubSub:      event_emitter.New[string, *nats_operations.PubSubSubscriber](&event_emitter.Config{}),
		Nats:        options.Nats,
		Connections: &connections.ConnectionManager{},
	}

	operations := &nats_operations.Instance{
		PubSub:      instance.PubSub,
		Connections: instance.Connections,
	}

	instance.NatsOperations = map[string]nats_operations.HandlerFunc{
		"subscribeToTopic":    operations.TopicSubscribe,
		"unsubscribeToTopic":  operations.TopicUnsubscribe,
		"findClientsByUserId": operations.FindClientsByUserId,
		"sendToUserId":        operations.SendToUserId,
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
