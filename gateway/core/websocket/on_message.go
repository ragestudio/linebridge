package websocket

import (
	unats "ultragateway/core/nats"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (manager *Instance) OnMessage(socket *gws.Conn, message *gws.Message) {
	defer message.Close()

	val, ok := socket.Session().Load(structs.WSCtxStoreKey)
	if !ok {
		socket.NetConn().Close()
		return
	}

	connCtx := val.(*structs.WSConnectionCtx)
	msgBytes := message.Bytes()

	var event string

	if ast, err := sonic.Get(msgBytes, "event"); err == nil {
		event, _ = ast.String()
	}

	if event == "" {
		return
	}

	if event == "ping" {
		socket.WriteMessage(gws.OpcodeText, []byte(`{"event":"pong"}`))
		return
	}

	headers := nats.Header{}

	headers.Add("event", event)
	headers.Add("token", connCtx.Token)
	headers.Add("socket_id", connCtx.ID)

	// other specific headers (comty-standard)
	headers.Add("user_id", connCtx.UserID)
	headers.Add("username", connCtx.Username)
	headers.Add("session_id", connCtx.SessionID)

	manager.Nats.PublishToIPC(unats.UpstreamPayload{
		Header: headers,
		Event:  event,
		Data:   sonic.NoCopyRawMessage(msgBytes),
	})
}
