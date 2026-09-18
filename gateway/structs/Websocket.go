package structs

import (
	"bufio"
	"bytes"
	"sync"

	"github.com/cloudwego/hertz/pkg/network"
)

const WSCtxStoreKey = "uctx"

type GwsConnWrapper struct {
	network.Conn
	HandshakeSwallowed bool
}

func (w *GwsConnWrapper) Write(b []byte) (int, error) {
	if !w.HandshakeSwallowed && bytes.HasPrefix(b, []byte("HTTP/1.1 101")) {
		w.HandshakeSwallowed = true
		return len(b), nil
	}

	return w.Conn.Write(b)
}

type WSConnectionCtx struct {
	Authorized bool `json:"authorized,omitempty"` // required for auth support

	// required ctx
	ID        string            `json:"socket_id"`       // the conn id
	Token     string            `json:"token,omitempty"` // required for auth support
	TokenType string            `json:"token_type,omitempty"`
	Meta      map[string]string `json:"meta,omitempty"`
	LastSeen  int64             `json:"last_seen,omitempty"`

	BufReader *bufio.Reader
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
