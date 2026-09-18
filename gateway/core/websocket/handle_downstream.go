package websocket

import (
	"ultragateway/core/websocket/nats_operations"

	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

func (context *Instance) HandleDownstream(msg *nats.Msg) {
	// first get the socket_id
	connID := msg.Header.Get("socket_id")

	// if not specified, we cannot pipe this msg to no client
	if connID == "" {
		nats_operations.RespondError(msg, "socket_id not specified")
		return
	}

	// get the connection socket
	conn, ok := context.Connections.GetConn(connID)

	if !ok {
		nats_operations.RespondError(msg, "socket_id not connected")
		return
	}

	// write the data
	conn.WriteMessage(gws.OpcodeText, msg.Data)
}
