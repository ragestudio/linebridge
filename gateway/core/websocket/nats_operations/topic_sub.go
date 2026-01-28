package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) TopicSubscribe(conn *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	if conn == nil || connCtx == nil {
		return nil
	}

	var op structs.ByTopicOperation

	err := sonic.UnmarshalString(string(msg.Data), &op)

	if err != nil || op.Data.Topic == "" {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Invalid payload or missing topic",
		}
	}

	subscriber := NewSubscriber(conn)
	context.PubSub.Subscribe(subscriber, op.Data.Topic, func(msg any) {
		broadcaster := msg.(*gws.Broadcaster)
		broadcaster.Broadcast(conn)
	})

	if IsDebug {
		log.Printf("User [%s] subscribed to topic [%s]", connCtx.Username, op.Data.Topic)
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
