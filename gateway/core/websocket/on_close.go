package websocket

import (
	unats "ultragateway/core/nats"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
)

func (manager *Instance) OnClose(conn *gws.Conn, err error) {
	connCtx, err := manager.Connections.Remove(conn)

	// just trying to deallocate the ctx obj
	defer func() {
		connCtx = nil
	}()

	if err != nil {
		return
	}

	// send to global
	disccEventData, _ := sonic.Marshal(connCtx)

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "disconnection",
			Data:  disccEventData,
		},
	)
}
