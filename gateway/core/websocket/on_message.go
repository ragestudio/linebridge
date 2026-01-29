package websocket

import (
	unats "ultragateway/core/nats"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (manager *Instance) OnMessage(conn *gws.Conn, message *gws.Message) {
	defer message.Close()

	connCtx, ok := manager.Connections.LoadConnCtx(conn)

	if !ok {
		conn.NetConn().Close()
		return
	}

	var event string

	if ast, err := sonic.Get(message.Bytes(), "event"); err == nil {
		event, _ = ast.String()
	}

	if event == "" {
		return
	}

	if event == "ping" {
		conn.WriteMessage(gws.OpcodeText, []byte(`{"event":"pong"}`))
		return
	}

	headers := nats.Header{}

	// inject the meta keys to headers
	for key, value := range connCtx.Meta {
		headers.Add(key, value)
	}

	// add base headers
	headers.Add("event", event)
	headers.Add("token", connCtx.Token)
	headers.Add("socket_id", connCtx.ID)

	manager.Nats.PublishToIPC(&unats.UpstreamPayload{
		Header: headers,
		Event:  event,
		Data:   sonic.NoCopyRawMessage(message.Bytes()),
	})
}
