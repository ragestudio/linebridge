package websocket

import (
	unats "ultragateway/core/nats"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
)

func (manager *Instance) OnClose(conn *gws.Conn, err error) {
	connCtx, removeErr := manager.Connections.Remove(conn)

	if removeErr != nil || connCtx == nil {
		return
	}

	// drop topic subscriptions
	manager.PubSub.UnsubscribeAll(connCtx.ID)

	// presence bookkeeping runs outside the connection teardown
	// ClosePresence waits for an in-flight track, so a connection that
	// opens and closes back to back can not leave a stale entry
	go connCtx.ClosePresence(func() {
		manager.presenceUntrack(connCtx)
	})

	disconnectionEvent, _ := sonic.Marshal(connCtx)

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "disconnection",
			Data:  disconnectionEvent,
		},
	)
}
