package websocket

import (
	"log"
	"time"
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

	// the close code tells whether it was us, the client or an intermediary
	remote := ""

	if addr := conn.RemoteAddr(); addr != nil {
		remote = addr.String()
	}

	uptime := time.Now().Unix() - connCtx.ConnectedAt()
	client := connCtx.ClientIP

	if client == "" {
		client = "-"
	}

	if closeErr, ok := err.(*gws.CloseError); ok {
		log.Printf(
			"websocket | connection [%s] received close frame (code=%d, reason=%q, client=%s, remote=%s, uptime=%ds)",
			connCtx.ID,
			closeErr.Code,
			string(closeErr.Reason),
			client,
			remote,
			uptime,
		)
	} else if err != nil {
		log.Printf(
			"websocket | connection [%s] closed without close frame (cause=%v, client=%s, remote=%s, uptime=%ds)",
			connCtx.ID,
			err,
			client,
			remote,
			uptime,
		)
	} else {
		log.Printf(
			"websocket | connection [%s] closed (client=%s, remote=%s, uptime=%ds)",
			connCtx.ID,
			client,
			remote,
			uptime,
		)
	}

	// presence bookkeeping runs outside the connection teardown
	// ClosePresence waits for an in-flight track, so a connection that
	// opens and closes back to back can not leave a stale entry
	if manager.presenceEnabled() {
		go connCtx.ClosePresence(func() {
			manager.presenceUntrack(connCtx)
		})
	}

	disconnectionEvent, _ := sonic.Marshal(connCtx)

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "disconnection",
			Data:  disconnectionEvent,
		},
	)
}
