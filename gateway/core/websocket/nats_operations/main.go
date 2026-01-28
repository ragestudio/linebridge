package nats_operations

import (
	"ultragateway/core/websocket/connections"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/event_emitter"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
)

type Instance struct {
	PubSub      *event_emitter.EventEmitter[string, *PubSubSubscriber]
	Connections *connections.ConnectionManager
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
