package websocket

import (
	"sort"

	"github.com/lxzan/gws"
)

// DebugConnection is a safe view of a live connection, the token is not exposed
type DebugConnection struct {
	SocketID    string            `json:"socket_id"`
	UserID      string            `json:"user_id,omitempty"`
	Authorized  bool              `json:"authorized"`
	TokenType   string            `json:"token_type,omitempty"`
	ConnectedAt int64             `json:"connected_at"`
	LastSeen    int64             `json:"last_seen"`
	ClientIP    string            `json:"client_ip,omitempty"`
	RemoteAddr  string            `json:"remote_addr,omitempty"`
	Topics      []string          `json:"topics"`
	Meta        map[string]string `json:"meta,omitempty"`
}

// DebugConnections returns a snapshot of every live connection
func (manager *Instance) DebugConnections() []DebugConnection {
	connections := make([]DebugConnection, 0, 64)

	manager.Connections.Clients.Range(func(_, value any) bool {
		conn, ok := value.(*gws.Conn)

		if !ok {
			return true
		}

		connCtx, ok := manager.Connections.LoadConnCtx(conn)

		if !ok {
			return true
		}

		entry := DebugConnection{
			SocketID:    connCtx.ID,
			UserID:      connCtx.UserID(),
			Authorized:  connCtx.Authorized,
			TokenType:   connCtx.TokenType,
			ConnectedAt: connCtx.ConnectedAt(),
			LastSeen:    connCtx.LastSeen(),
			ClientIP:    connCtx.ClientIP,
			Topics:      manager.PubSub.Topics(connCtx.ID),
			Meta:        connCtx.Meta,
		}

		if addr := conn.RemoteAddr(); addr != nil {
			entry.RemoteAddr = addr.String()
		}

		connections = append(connections, entry)

		return true
	})

	sort.Slice(connections, func(left, right int) bool {
		return connections[left].ConnectedAt > connections[right].ConnectedAt
	})

	return connections
}

// DebugStats returns the active connection and user counts
func (manager *Instance) DebugStats() (connections int, users int) {
	manager.Connections.Clients.Range(func(_, _ any) bool {
		connections++
		return true
	})

	manager.Connections.UsersRef.Range(func(_, _ any) bool {
		users++
		return true
	})

	return connections, users
}

// CloseConnection closes a connection by its socket id
func (manager *Instance) CloseConnection(socketID string, code uint16, reason string) bool {
	conn, ok := manager.Connections.GetConn(socketID)

	if !ok {
		return false
	}

	manager.CloseConn(conn, code, reason)

	return true
}
