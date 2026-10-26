package websocket

import (
	"github.com/lxzan/gws"
)

// OnPing handles protocol level pings sent by the client
// control frames can not carry more than 125 bytes
func (manager *Instance) OnPing(socket *gws.Conn, payload []byte) {
	if len(payload) > 125 {
		payload = nil
	}

	_ = socket.WritePong(payload)
}

// OnClientPing answers the application level ping used by the js client
func (manager *Instance) OnClientPing(socket *gws.Conn) {
	_ = socket.WriteMessage(gws.OpcodeText, []byte(`{"event":"pong"}`))
}
