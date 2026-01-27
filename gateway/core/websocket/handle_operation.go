package websocket

import (
	"log"
	"ultragateway/core/websocket/nats_operations"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

// Handles the operations actions requested by microservices
// E.G. doThisOperation(microservice) -> gateway getClientByConnID() result -> microservice(sender of the operation)
func (context *Instance) HandleOperation(msg *nats.Msg) {
	log.Printf("WEBSOCKET NATS | Operation request [%s]: %s", msg.Subject, string(msg.Data))

	var conn *gws.Conn
	var connCtx *structs.WSConnectionCtx

	// if socket_id is present in the header
	// load the connection & context
	if msg.Header.Get("socket_id") != "" {
		var exist bool

		if conn, exist = context.Connections.GetConn(msg.Header.Get("socket_id")); exist {
			connCtx, _ = context.Connections.LoadConnCtx(conn)
		}
	}

	ast, err := sonic.Get(msg.Data, "type")

	if err != nil {
		nats_operations.RespondError(msg, "Failed to unmarshal operation")
		return
	}

	opType, err := ast.String()

	if opType == "" {
		nats_operations.RespondError(msg, "Invalid operation type")
		return
	}

	// check if handler exists
	handler, exists := context.NatsOperations[opType]

	if !exists {
		nats_operations.RespondError(msg, "Operation type not found")
		return
	}

	// send the response
	nats_operations.RespondWithResult(msg, handler(conn, connCtx, msg))
}
