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
			Ok:   false,
			Data: []byte(`{ "error": "Invalid payload or missing topic" }`),
		}
	}

	log.Printf("Subcribing to topic %v", op.Data.Topic)

	subscriber := NewSubscriber(conn)
	context.PubSub.Subscribe(subscriber, op.Data.Topic, func(msg any) {})

	log.Printf("Subscribed to topic %v", op.Data.Topic)

	return &structs.OperationResult{
		Ok:   true,
		Data: []byte(`{ "topic": "` + op.Data.Topic + `" }`),
	}
}
