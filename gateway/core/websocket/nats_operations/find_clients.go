package nats_operations

import (
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) FindClientsByUserId(conn *gws.Conn, ctx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	var op structs.ByUserIDOperation

	if err := sonic.Unmarshal(msg.Data, &op); err != nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: err.Error(),
		}
	}

	requestedUserID := op.Data.UserID

	if requestedUserID == "" {
		return &structs.OperationResult{Ok: false, Error: "Missing user_id"}
	}

	// lookup for user connections
	refs := context.Connections.GetUserIDConnections(requestedUserID)

	// if empty, just return empty array
	if refs == nil {
		return &structs.OperationResult{
			Ok:   true,
			Data: []structs.WSConnectionCtx{},
		}
	}

	// create the safecopy
	socketsIds := refs.Keys()

	// preallocate a slice
	clients := make([]*structs.WSConnectionCtx, 0, len(socketsIds))

	// iterate over the socketsIds, just set the conn context as value
	for _, socketId := range socketsIds {
		connCtx, ok := context.Connections.GetConnCtx(socketId)

		if !ok {
			continue
		}

		clients = append(clients, connCtx)
	}

	return &structs.OperationResult{
		Ok:   true,
		Data: clients,
	}
}
