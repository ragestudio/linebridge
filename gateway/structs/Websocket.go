package structs

import (
	"bytes"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cloudwego/hertz/pkg/network"
)

const WSCtxStoreKey = "uctx"

var handshakePrefix = []byte("HTTP/1.1 101")

// GwsConnWrapper adapts the hijacked hertz connection to gws
// it swallows the second handshake written by gws, since hertz already
// flushed the 101 response before handing the connection over
// it also applies a write deadline to every frame so a client that stops
// reading can not block a write goroutine forever
type GwsConnWrapper struct {
	network.Conn

	writeTimeout       time.Duration
	handshakeSwallowed bool
}

func NewGwsConnWrapper(conn network.Conn, writeTimeout time.Duration) *GwsConnWrapper {
	return &GwsConnWrapper{
		Conn:         conn,
		writeTimeout: writeTimeout,
	}
}

func (w *GwsConnWrapper) Write(b []byte) (int, error) {
	if !w.handshakeSwallowed && bytes.HasPrefix(b, handshakePrefix) {
		w.handshakeSwallowed = true
		return len(b), nil
	}

	if w.writeTimeout > 0 {
		_ = w.Conn.SetWriteDeadline(time.Now().Add(w.writeTimeout))
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

	// real client address resolved from the proxy headers on the handshake
	ClientIP string `json:"client_ip,omitempty"`

	// heartbeat state, written by the read loop and read by the heartbeat workers
	lastSeen atomic.Int64
	lastPing atomic.Int64
	closing  atomic.Bool

	// connection timestamp, used for presence bookkeeping
	connectedAt int64

	// presence operations are serialized per connection, so an open and a
	// close happening back to back can not be applied out of order
	presenceMutex  sync.Mutex
	presenceClosed bool
}

// Touch marks the connection as alive, any inbound frame counts as activity
func (ctx *WSConnectionCtx) Touch() {
	ctx.lastSeen.Store(time.Now().Unix())
}

func (ctx *WSConnectionCtx) LastSeen() int64 {
	return ctx.lastSeen.Load()
}

func (ctx *WSConnectionCtx) ConnectedAt() int64 {
	return ctx.connectedAt
}

// UserID returns the user id bound to this connection, empty when anonymous
func (ctx *WSConnectionCtx) UserID() string {
	if ctx.Meta == nil {
		return ""
	}

	return ctx.Meta["user_id"]
}

// InitHeartbeat seeds the heartbeat state on connection open
func (ctx *WSConnectionCtx) InitHeartbeat(now int64) {
	ctx.lastSeen.Store(now)
	ctx.lastPing.Store(now)
	ctx.connectedAt = now
}

// PingDue reports whether a ping should be sent for this connection
func (ctx *WSConnectionCtx) PingDue(now, interval int64) bool {
	lastPing := ctx.lastPing.Load()

	// a value in the future means another worker already took it
	if lastPing > now {
		return false
	}

	return now-lastPing >= interval
}

func (ctx *WSConnectionCtx) MarkPing(now int64) {
	ctx.lastPing.Store(now)
}

// Expired reports whether the connection missed its heartbeat window
func (ctx *WSConnectionCtx) Expired(now, maxAge int64) bool {
	return now-ctx.lastSeen.Load() > maxAge
}

// BeginClose marks the connection as closing, it returns false when
// another goroutine already started the teardown
func (ctx *WSConnectionCtx) BeginClose() bool {
	return ctx.closing.CompareAndSwap(false, true)
}

// RunPresenceUpdate runs a presence update unless the presence of this
// connection was already closed. The mutex keeps open and close updates
// ordered for the same connection.
func (ctx *WSConnectionCtx) RunPresenceUpdate(fn func()) {
	ctx.presenceMutex.Lock()
	defer ctx.presenceMutex.Unlock()

	if ctx.presenceClosed {
		return
	}

	fn()
}

// ClosePresence waits for any in-flight presence update, blocks further
// updates and runs the cleanup for this connection
func (ctx *WSConnectionCtx) ClosePresence(fn func()) {
	ctx.presenceMutex.Lock()
	defer ctx.presenceMutex.Unlock()

	if ctx.presenceClosed {
		return
	}

	ctx.presenceClosed = true
	fn()
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
