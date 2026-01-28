package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) SendToUserId(_ *gws.Conn, _ *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	operationDataNode, err := sonic.Get(msg.Data, "data")

	if err != nil {
		log.Printf("SendToUserId > invalid json structure: %v", err)

		return &structs.OperationResult{
			Ok:    false,
			Error: "Invalid payload format",
		}
	}

	userID, _ := operationDataNode.Get("user_id").String()

	if userID == "" {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Missing target user_id",
		}
	}

	userRefs := context.Connections.GetUserIDConnections(userID)

	if userRefs == nil {
		return &structs.OperationResult{Ok: true}
	}

	payload, err := operationDataNode.Get("data").MarshalJSON()

	if err != nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Failed to extract payload raw data",
		}
	}

	connIDs := userRefs.Keys()

	broadcaster := gws.NewBroadcaster(gws.OpcodeText, payload)
	defer broadcaster.Close()

	for _, connID := range connIDs {
		if conn, ok := context.Connections.GetConn(connID); ok {
			_ = broadcaster.Broadcast(conn)
		}
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
