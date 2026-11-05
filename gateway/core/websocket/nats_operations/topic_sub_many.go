package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

// TopicSubscribeMany subscribes a connection to several topics in one call,
// avoiding one round trip per topic when a view watches many users
func (context *Instance) TopicSubscribeMany(conn *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	if conn == nil || connCtx == nil {
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

	subscribed := 0
	failed := 0

	for _, topic := range op.Data.Topics {
		if err := context.PubSub.Subscribe(connCtx.ID, conn, topic); err != nil {
			// the per connection limit may reject the extra topics, keep
			// the ones that did fit instead of failing the whole batch
			failed++
			continue
		}

		subscribed++
	}

	if IsDebug {
		log.Printf(
			"Conn [%s] subscribed to %d topics (%d rejected)",
			connCtx.ID,
			subscribed,
			failed,
		)
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
