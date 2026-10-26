package logs

import (
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	combinedBufferSize = 5000
	scopeBufferSize    = 2000
	subscriberBuffer   = 512
)

// Line is a single captured log line
type Line struct {
	Time    int64  `json:"time"`
	Scope   string `json:"scope"`
	Stream  string `json:"stream,omitempty"`
	Message string `json:"message"`
}

type ring struct {
	lines []Line
	next  int
	count int
}

func newRing(size int) *ring {
	return &ring{lines: make([]Line, size)}
}

func (r *ring) add(line Line) {
	r.lines[r.next] = line
	r.next = (r.next + 1) % len(r.lines)

	if r.count < len(r.lines) {
		r.count++
	}
}

func (r *ring) tail(limit int) []Line {
	if limit <= 0 || limit > r.count {
		limit = r.count
	}

	out := make([]Line, 0, limit)
	start := (r.next - r.count + len(r.lines)) % len(r.lines)

	for i := 0; i < r.count; i++ {
		out = append(out, r.lines[(start+i)%len(r.lines)])
	}

	if len(out) > limit {
		out = out[len(out)-limit:]
	}

	return out
}

func (r *ring) clear() {
	r.next = 0
	r.count = 0
}

// Hub keeps the last lines of every log scope in memory and fans them out
// to the control api subscribers. Subscribers never block a writer, when
// their buffer is full the line is dropped.
type Hub struct {
	mutex       sync.RWMutex
	combined    *ring
	scopes      map[string]*ring
	subscribers map[int]chan Line
	nextID      int
	dropped     atomic.Uint64
}

func NewHub() *Hub {
	return &Hub{
		combined:    newRing(combinedBufferSize),
		scopes:      make(map[string]*ring),
		subscribers: make(map[int]chan Line),
	}
}

// Write appends one line to the combined buffer and to its scope buffer
func (hub *Hub) Write(scope, stream, message string) {
	message = strings.TrimRight(message, "\r\n")

	if message == "" {
		return
	}

	if scope == "" {
		scope = "gateway"
	}

	// the standard logger adds a timestamp, the line already carries one
	if scope == "gateway" {
		message = stripTimestampPrefix(message)
	}

	line := Line{
		Time:    time.Now().UnixMilli(),
		Scope:   scope,
		Stream:  stream,
		Message: message,
	}

	hub.mutex.Lock()
	defer hub.mutex.Unlock()

	hub.combined.add(line)

	scopeRing, ok := hub.scopes[scope]

	if !ok {
		scopeRing = newRing(scopeBufferSize)
		hub.scopes[scope] = scopeRing
	}

	scopeRing.add(line)

	for _, subscriber := range hub.subscribers {
		select {
		case subscriber <- line:
		default:
			hub.dropped.Add(1)
		}
	}
}

// Tail returns the last lines of a scope, "all" returns the combined buffer
func (hub *Hub) Tail(scope string, limit int) []Line {
	hub.mutex.RLock()
	defer hub.mutex.RUnlock()

	if scope == "" || scope == "all" {
		return hub.combined.tail(limit)
	}

	scopeRing, ok := hub.scopes[scope]

	if !ok {
		return []Line{}
	}

	return scopeRing.tail(limit)
}

func (hub *Hub) Scopes() []string {
	hub.mutex.RLock()
	defer hub.mutex.RUnlock()

	scopes := make([]string, 0, len(hub.scopes))

	for scope := range hub.scopes {
		scopes = append(scopes, scope)
	}

	return scopes
}

func (hub *Hub) Dropped() uint64 {
	return hub.dropped.Load()
}

// Count returns how many lines are buffered for a scope
func (hub *Hub) Count(scope string) int {
	hub.mutex.RLock()
	defer hub.mutex.RUnlock()

	if scope == "" || scope == "all" {
		return hub.combined.count
	}

	if scopeRing, ok := hub.scopes[scope]; ok {
		return scopeRing.count
	}

	return 0
}

func (hub *Hub) Clear() {
	hub.mutex.Lock()
	defer hub.mutex.Unlock()

	hub.combined.clear()

	for _, scopeRing := range hub.scopes {
		scopeRing.clear()
	}

	hub.dropped.Store(0)
}

// Subscribe returns a channel with new lines and a cancel function
func (hub *Hub) Subscribe() (<-chan Line, func()) {
	hub.mutex.Lock()
	defer hub.mutex.Unlock()

	id := hub.nextID
	hub.nextID++

	channel := make(chan Line, subscriberBuffer)
	hub.subscribers[id] = channel

	return channel, func() {
		hub.mutex.Lock()
		defer hub.mutex.Unlock()

		if subscriber, ok := hub.subscribers[id]; ok {
			delete(hub.subscribers, id)
			close(subscriber)
		}
	}
}

// stripTimestampPrefix removes the default log timestamp from a line
func stripTimestampPrefix(message string) string {
	// format: 2006/01/02 15:04:05
	if len(message) < 20 {
		return message
	}

	if message[4] != '/' || message[7] != '/' || message[10] != ' ' {
		return message
	}

	if message[13] != ':' || message[16] != ':' || message[19] != ' ' {
		return message
	}

	return message[20:]
}

// Writer adapts the hub to the io.Writer expected by the standard logger
func (hub *Hub) Writer(scope, stream string) io.Writer {
	return &writer{hub: hub, scope: scope, stream: stream}
}

type writer struct {
	hub    *Hub
	scope  string
	stream string
}

func (w *writer) Write(data []byte) (int, error) {
	w.hub.Write(w.scope, w.stream, string(data))

	return len(data), nil
}
