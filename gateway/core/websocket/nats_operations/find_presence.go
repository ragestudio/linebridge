package nats_operations

import (
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) FindPresenceByUserIds(conn *gws.Conn, ctx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult {
	var op structs.ByUserIDsOperation

	if err := sonic.Unmarshal(msg.Data, &op); err != nil {
		return &structs.OperationResult{
			Ok:    false,
			Error: err.Error(),
		}
	}

	requestedUserIDs := op.Data.UserIDs
	if len(requestedUserIDs) == 0 {
		return &structs.OperationResult{
			Ok:    false,
			Error: "Missing user_ids",
		}
	}

	var presenceList []structs.UserPresence

	for _, userID := range requestedUserIDs {
		refs := context.Connections.GetUserIDConnections(userID)

		if refs == nil {
			presenceList = append(presenceList, structs.UserPresence{
				UserID:    userID,
				Connected: false,
			})
			continue
		}

		socketsIds := refs.Keys()
		if len(socketsIds) == 0 {
			presenceList = append(presenceList, structs.UserPresence{
				UserID:    userID,
				Connected: false,
			})
			continue
		}

		for _, socketId := range socketsIds {
			_, ok := context.Connections.GetConnCtx(socketId)
			presenceList = append(presenceList, structs.UserPresence{
				SocketID:  socketId,
				UserID:    userID,
				Connected: ok,
			})
		}
	}

	return &structs.OperationResult{
		Ok:   true,
		Data: presenceList,
	}
}
