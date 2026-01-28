package structs

import "sync"

const WSCtxStoreKey = "uctx"

type WSConnectionCtx struct {
	// required ctx
	ID    string `json:"socket_id"`       // the conn id
	Token string `json:"token,omitempty"` // required for auth support

	// comty-standard specific properties
	UserID    string `json:"user_id,omitempty"`
	Username  string `json:"username,omitempty"`
	SessionID string `json:"session_id,omitempty"`
}

type WSUserConnections struct {
	Mu    sync.Mutex
	Conns map[string]struct{}
}

func (ctx *WSUserConnections) Keys() []string {
	ctx.Mu.Lock()
	defer ctx.Mu.Unlock()

	ids := make([]string, 0, len(ctx.Conns))

	for id := range ctx.Conns {
		ids = append(ids, id)
	}

	return ids
}
