package websocket

import (
	"ultragateway/structs"

	"github.com/lxzan/gws"
)

// OnPong handles protocol level pongs, a pong means the peer is alive
func (manager *Instance) OnPong(socket *gws.Conn, payload []byte) {
	val, ok := socket.Session().Load(structs.WSCtxStoreKey)

	if !ok {
		return
	}

	connCtx, ok := val.(*structs.WSConnectionCtx)

	if !ok {
		return
	}

	connCtx.Touch()
}
