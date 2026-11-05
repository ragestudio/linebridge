package nats_operations

import (
	"os"
	"ultragateway/core/websocket/connections"
	"ultragateway/core/websocket/topics"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

var IsDebug bool = os.Getenv("DEBUG") == "true"

// clientNotFoundError tells the caller the socket is not owned by this node,
// so the operation can be retried against the broadcast subject
const clientNotFoundError = "client_not_found"

type Instance struct {
	PubSub      *topics.Manager
	Connections *connections.ConnectionManager

	// FindClusterClients returns every socket of a user known by the
	// cluster, not only the ones connected to this gateway. It is optional
	// and returns nil when the backing store is not available.
	FindClusterClients func(userID string) []*structs.WSConnectionCtx
}

type HandlerFunc func(conn *gws.Conn, ctx *structs.WSConnectionCtx, msg *nats.Msg) *structs.OperationResult

func RespondWithResult(msg *nats.Msg, opResult *structs.OperationResult) {
	result, _ := sonic.Marshal(opResult)

	msg.RespondMsg(&nats.Msg{
		Header: msg.Header,
		Data:   result,
	})
}

func RespondError(msg *nats.Msg, errStr string) {
	RespondWithResult(msg, &structs.OperationResult{
		Ok:    false,
		Error: errStr,
	})
}

func RespondOk(msg *nats.Msg, data any) {
	RespondWithResult(msg, &structs.OperationResult{
		Ok:   true,
		Data: data,
	})
}
