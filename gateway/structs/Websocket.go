package structs

import (
	"sync"
)

const WSCtxStoreKey = "uctx"

type WSConnectionCtx struct {
	Authorized bool `json:"authorized,omitempty"` // required for auth support

	// required ctx
	ID    string            `json:"socket_id"`       // the conn id
	Token string            `json:"token,omitempty"` // required for auth support
	Meta  map[string]string `json:"meta,omitempty"`
}

type WSUserConnections struct {
	Conns map[string]struct{}
	Mutex sync.Mutex
}

func (ctx *WSUserConnections) Keys() []string {
	ctx.Mutex.Lock()
	defer ctx.Mutex.Unlock()

	ids := make([]string, 0, len(ctx.Conns))

	for id := range ctx.Conns {
		ids = append(ids, id)
	}

	return ids
}
