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
			Id            string            `json:"id"`
			Authenticated bool              `json:"authenticated"`
			Meta          map[string]string `json:"meta"`
		}{
			Id:            ConnCtx.ID,
			Authenticated: ConnCtx.Token != "",
			Meta:          ConnCtx.Meta,
		},
	})

	socket.WriteMessage(gws.OpcodeText, connectedMessage)

	// send to global
	connEventData, _ := sonic.Marshal(ConnCtx)

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "connection",
			Data:  connEventData,
		},
	)
}
