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
		return &structs.OperationResult{
			Ok:    false,
			Error: "Missing user_id",
		}
	}

	// always include the sockets connected to this gateway
	clients := make([]*structs.WSConnectionCtx, 0, 4)
	seen := make(map[string]struct{}, 4)

	if refs := context.Connections.GetUserIDConnections(requestedUserID); refs != nil {
		for _, socketID := range refs.Keys() {
			connCtx, ok := context.Connections.GetConnCtx(socketID)

			if !ok {
				continue
			}

			clients = append(clients, connCtx)
			seen[socketID] = struct{}{}
		}
	}

	// sockets owned by other gateways come from the shared presence index,
	// so every gateway answers with the same complete list
	if context.FindClusterClients != nil {
		for _, remote := range context.FindClusterClients(requestedUserID) {
			if _, exists := seen[remote.ID]; exists {
				continue
			}

			clients = append(clients, remote)
		}
	}

	return &structs.OperationResult{
		Ok:   true,
		Data: clients,
	}
}
