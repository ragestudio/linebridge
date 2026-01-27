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
			Ok:   false,
			Data: []byte(`{ "error": "Invalid payload or missing topic" }`),
		}
	}

	log.Printf("Unsubcribing from topic %v", op.Data.Topic)

	subscriber := NewSubscriber(conn)
	context.PubSub.UnSubscribe(subscriber, op.Data.Topic)

	log.Printf("Unsubcribed from topic %v", op.Data.Topic)

	return &structs.OperationResult{
		Ok:   true,
		Data: []byte(`{ "topic": "` + op.Data.Topic + `" }`),
	}
}
