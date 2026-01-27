package websocket

import (
	"github.com/lxzan/gws"
)

func (manager *Instance) OnPing(socket *gws.Conn, payload []byte) {}
