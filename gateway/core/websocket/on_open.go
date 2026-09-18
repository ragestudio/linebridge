package websocket

import (
	"context"
	"time"
	unats "ultragateway/core/nats"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func (manager *Instance) OnOpen(socket *gws.Conn) {
	_, span := OTELTracer.Start(context.Background(), "ws-conn-open",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()

	socket.SetDeadline(time.Time{})
	socket.SetReadDeadline(time.Time{})
	socket.SetWriteDeadline(time.Time{})

	val, ok := socket.Session().Load(structs.WSCtxStoreKey)
	netConn := socket.NetConn()

	if !ok {
		if netConn != nil {
			netConn.Close()
		}
		return
	}

	ConnCtx := val.(*structs.WSConnectionCtx)
	ConnCtx.LastSeen = time.Now().Unix()

	span.AddEvent("context_load", trace.WithAttributes(
		attribute.String("socket_id", ConnCtx.ID),
	))

	connectedMessage, _ := sonic.Marshal(structs.EventData{
		Event: "connected",
		Data: struct {
			Id            string            `json:"id"`
			Authenticated bool              `json:"authenticated"`
			Meta          map[string]string `json:"meta"`
		}{
			Id:            ConnCtx.ID,
			Authenticated: ConnCtx.Token != "",
			Meta:          ConnCtx.Meta,
		},
	})

	socket.WriteMessage(gws.OpcodeText, connectedMessage)

	span.AddEvent("ws-conn-send_ack")

	// send to global
	connEventData, _ := sonic.Marshal(ConnCtx)

	// register presence in Redis if enabled
	if manager.Redis != nil {
		userId := ConnCtx.Meta["user_id"]

		if userId != "" {
			ctxBg := context.Background()
			userKey := "presence:user:" + userId
			socketKey := "presence:sockets:" + ConnCtx.ID

			pipe := manager.Redis.Client.Pipeline()
			pipe.SAdd(ctxBg, userKey, ConnCtx.ID)
			pipe.HSet(ctxBg, socketKey, map[string]interface{}{
				"user_id":      userId,
				"connected_at": ConnCtx.LastSeen,
			})
			pipe.ZAdd(ctxBg, "presence:global_users", redis.Z{
				Score:  float64(ConnCtx.LastSeen),
				Member: userId,
			})
			_, err := pipe.Exec(ctxBg)
			if err != nil {
				span.RecordError(err)
			}
		}
	}

	manager.Nats.PublishToGlobal(
		&unats.UpstreamPayload{
			Event: "connection",
			Data:  connEventData,
		},
	)

	span.AddEvent("ws-conn-global_pub")
}
