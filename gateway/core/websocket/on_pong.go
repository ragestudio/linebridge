package websocket

import (
	"time"

	"ultragateway/structs"

	"github.com/lxzan/gws"
)

func (manager *Instance) OnPong(socket *gws.Conn, payload []byte) {
	val, ok := socket.Session().Load(structs.WSCtxStoreKey)

	if ok {
		ConnCtx := val.(*structs.WSConnectionCtx)
		ConnCtx.LastSeen = time.Now().Unix()
	}
}
