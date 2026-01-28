package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) SendToTopic(conn *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	dataNode, err := sonic.Get(msg.Data, "data")

	if err != nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Failed to parse payload",
		}
	}

	targetTopic, err := dataNode.Get("topic").String()

	if err != nil || targetTopic == "" {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Invalid payload or missing topic",
		}
	}

	data, err := dataNode.MarshalJSON()

	if err != nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Failed to parse payload [data]",
		}
	}

	broadcaster := gws.NewBroadcaster(gws.OpcodeText, data)
	defer broadcaster.Close()

	if IsDebug {
		log.Printf("Sending a event to topic[%s]", targetTopic)
	}

	context.PubSub.Publish(targetTopic, broadcaster)

	return &structs.OperationResult{Ok: true}
}
