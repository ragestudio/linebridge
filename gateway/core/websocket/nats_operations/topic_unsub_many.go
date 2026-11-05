package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

// TopicUnsubscribeMany removes several topic subscriptions in one call
func (context *Instance) TopicUnsubscribeMany(_ *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	if connCtx == nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: clientNotFoundError,
		}
	}

	var op structs.ByTopicsOperation

	if err := sonic.UnmarshalString(string(msg.Data), &op); err != nil || len(op.Data.Topics) == 0 {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Invalid payload or missing topics",
		}
	}

	for _, topic := range op.Data.Topics {
		context.PubSub.Unsubscribe(connCtx.ID, topic)
	}

	if IsDebug {
		log.Printf("Conn [%s] unsubscribed from %d topics", connCtx.ID, len(op.Data.Topics))
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
