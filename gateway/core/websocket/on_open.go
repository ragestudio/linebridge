package websocket

import (
	unats "ultragateway/core/nats"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
)

func (manager *Instance) OnOpen(socket *gws.Conn) {
	val, ok := socket.Session().Load(structs.WSCtxStoreKey)

	if !ok {
		socket.NetConn().Close()
		return
	}

	ConnCtx := val.(*structs.WSConnectionCtx)

	connectedMessage, _ := sonic.Marshal(structs.EventData{
		Event: "connected",
		Data: struct {
			Id            string `json:"id"`
			Authenticated bool   `json:"authenticated"`
		}{
			Id:            ConnCtx.ID,
			Authenticated: ConnCtx.Token != "",
		},
	})

	socket.WriteMessage(gws.OpcodeText, connectedMessage)

	if ConnCtx.SessionID == "" {
		unauthorizedMessage, _ := sonic.Marshal(structs.EventData{
			Event: "user:unauthorized",
		})

		socket.WriteMessage(gws.OpcodeText, unauthorizedMessage)

		return
	} else {
		authorizedMessage, _ := sonic.Marshal(structs.EventData{
			Event: "user:authed",
			Data: struct {
				UserID string `json:"user_id"`
			}{
				UserID: ConnCtx.UserID,
			},
		})

		socket.WriteMessage(gws.OpcodeText, authorizedMessage)
	}

	// send to global
	connEventData, _ := sonic.Marshal(ConnCtx)

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "connection",
			Data:  connEventData,
		},
	)
}
