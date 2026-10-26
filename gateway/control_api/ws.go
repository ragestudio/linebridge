package control_api

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
	"ultragateway/core/logs"

	"github.com/lxzan/gws"
)

const wsStateKey = "control_ws_state"

type wsHandler struct {
	api *ControlAPI
}

type wsClientState struct {
	mutex     sync.Mutex
	sendMutex sync.Mutex
	scopes    map[string]struct{}
	done      chan struct{}
	once      sync.Once
}

func (state *wsClientState) stop() {
	state.once.Do(func() {
		close(state.done)
	})
}

func (state *wsClientState) setScopes(scopes []string) {
	state.mutex.Lock()
	defer state.mutex.Unlock()

	state.scopes = make(map[string]struct{}, len(scopes))

	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)

		if scope != "" {
			state.scopes[scope] = struct{}{}
		}
	}
}

func (state *wsClientState) matches(scope string) bool {
	state.mutex.Lock()
	defer state.mutex.Unlock()

	if len(state.scopes) == 0 {
		return true
	}

	if _, ok := state.scopes["*"]; ok {
		return true
	}

	if _, ok := state.scopes[scope]; ok {
		return true
	}

	// "service" matches every service scope
	if _, ok := state.scopes["service"]; ok && strings.HasPrefix(scope, "service:") {
		return true
	}

	return false
}

func wsState(conn *gws.Conn) *wsClientState {
	value, ok := conn.Session().Load(wsStateKey)

	if !ok {
		return nil
	}

	state, _ := value.(*wsClientState)

	return state
}

func (handler *wsHandler) OnOpen(conn *gws.Conn) {
	state := &wsClientState{
		scopes: make(map[string]struct{}),
		done:   make(chan struct{}),
	}

	conn.Session().Store(wsStateKey, state)

	handler.send(conn, "hello", map[string]any{
		"mode":     handler.api.mode(),
		"version":  handler.api.options.Version,
		"services": handler.api.servicesView(),
		"system":   handler.api.systemSnapshot(),
	})

	go handler.pump(conn, state)
}

func (handler *wsHandler) pump(conn *gws.Conn, state *wsClientState) {
	var channel <-chan logs.Line
	cancel := func() {}

	if handler.api.options.Logs != nil {
		channel, cancel = handler.api.options.Logs.Subscribe()
	}

	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-state.done:
			return
		case line, ok := <-channel:
			if !ok {
				return
			}

			if state.matches(line.Scope) {
				handler.send(conn, "log", line)
			}
		case <-ticker.C:
			handler.send(conn, "stats", map[string]any{
				"system":   handler.api.systemSnapshot(),
				"services": handler.api.servicesView(),
			})
		}
	}
}

func (handler *wsHandler) OnMessage(conn *gws.Conn, message *gws.Message) {
	defer message.Close()

	state := wsState(conn)

	if state == nil {
		return
	}

	payload := struct {
		Type   string   `json:"type"`
		Scopes []string `json:"scopes"`
	}{}

	if err := json.Unmarshal(message.Bytes(), &payload); err != nil {
		return
	}

	switch payload.Type {
	case "subscribe":
		state.setScopes(payload.Scopes)
		handler.send(conn, "subscribed", map[string]any{"scopes": payload.Scopes})
	case "stats":
		handler.send(conn, "stats", map[string]any{
			"system":   handler.api.systemSnapshot(),
			"services": handler.api.servicesView(),
		})
	case "ping":
		handler.send(conn, "pong", nil)
	}
}

func (handler *wsHandler) OnClose(conn *gws.Conn, err error) {
	if state := wsState(conn); state != nil {
		state.stop()
	}

	conn.Session().Delete(wsStateKey)
}

func (handler *wsHandler) OnPing(conn *gws.Conn, payload []byte) {
	if len(payload) > 125 {
		payload = nil
	}

	_ = conn.WritePong(payload)
}

func (handler *wsHandler) OnPong(conn *gws.Conn, payload []byte) {}

func (handler *wsHandler) send(conn *gws.Conn, event string, data any) {
	payload, err := json.Marshal(map[string]any{
		"type": event,
		"data": data,
	})

	if err != nil {
		return
	}

	if state := wsState(conn); state != nil {
		state.sendMutex.Lock()
		defer state.sendMutex.Unlock()
	}

	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	if err := conn.WriteMessage(gws.OpcodeText, payload); err != nil {
		if state := wsState(conn); state != nil {
			state.stop()
		}
	}
}

func (api *ControlAPI) mode() string {
	if api.options.Config != nil && api.options.Config.Mode != "" {
		return api.options.Config.Mode
	}

	return "dev"
}

// handleStream upgrades the request and streams logs and stats
func (api *ControlAPI) handleStream(writer http.ResponseWriter, request *http.Request) {
	conn, err := api.upgrader.Upgrade(writer, request)

	if err != nil {
		return
	}

	conn.ReadLoop()
}
