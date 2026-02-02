package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) TopicUnsubscribe(conn *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
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
	context.PubSub.UnSubscribe(subscriber, op.Data.Topic)

	if IsDebug {
		log.Printf("Conn [%s] unsubscribed of topic [%s]", connCtx.ID, op.Data.Topic)
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
