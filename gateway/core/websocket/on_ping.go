package websocket

import (
	"github.com/lxzan/gws"
)

func (manager *Instance) OnPing(socket *gws.Conn, payload []byte) {
	_ = socket.WritePong(nil)
	_ = socket.WriteMessage(gws.OpcodeText, []byte(`{ "event": "pong" }`))
}
