package nats_operations

import (
	"log"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) SendToUserId(conn *gws.Conn, connCtx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	var op structs.ByUserIdSendOperation

	err := sonic.UnmarshalString(string(msg.Data), &op)

	if err != nil || op.Data.UserID == "" {
		if err != nil {
			log.Printf("Failed to unmarshal payload: %v", err)
		}

		return &structs.OperationResult{
			Ok:    false,
			Error: `{ "error": "Invalid payload or missing target user_id" }`,
		}
	}

	refs := context.Connections.GetUserIDConnections(op.Data.UserID)

	connIds := refs.Keys()

	dataAst, err := sonic.Get(msg.Data, "data")

	if err != nil {
		log.Printf("Failed to get data from payload: %v", err)

		return &structs.OperationResult{
			Ok:    false,
			Error: `{ "error": "Failed to get data from payload" }`,
		}
	}

	rawData, err := dataAst.Raw()

	if err != nil {
		log.Printf("Failed to get raw data from payload: %v", err)

		return &structs.OperationResult{
			Ok:    false,
			Error: `{ "error": "Failed to get raw data from payload" }`,
		}
	}

	for _, connId := range connIds {
		conn, ok := context.Connections.GetConn(connId)

		if !ok {
			continue
		}

		conn.WriteString(rawData)
	}

	return &structs.OperationResult{
		Ok: true,
	}
}
