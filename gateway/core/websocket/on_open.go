package websocket

import (
	"context"
	"time"
	unats "ultragateway/core/nats"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func (manager *Instance) OnOpen(socket *gws.Conn) {
	_, span := OTELTracer.Start(context.Background(), "ws-conn-open",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()

	socket.SetDeadline(time.Time{})

	val, ok := socket.Session().Load(structs.WSCtxStoreKey)
	netConn := socket.NetConn()

	if !ok {
		if netConn != nil {
			netConn.Close()
		}
		return
	}

	ConnCtx := val.(*structs.WSConnectionCtx)

	span.AddEvent("context_load", trace.WithAttributes(
		attribute.String("socket_id", ConnCtx.ID),
	))

	connectedMessage, _ := sonic.Marshal(structs.EventData{
		Event: "connected",
		Data: struct {
			Id            string            `json:"id"`
			NodeID        string            `json:"node_id,omitempty"`
			Authenticated bool              `json:"authenticated"`
			Meta          map[string]string `json:"meta"`
		}{
			Id:            ConnCtx.ID,
			NodeID:        ConnCtx.NodeID,
			Authenticated: ConnCtx.Token != "",
			Meta:          ConnCtx.Meta,
		},
	})

	socket.WriteMessage(gws.OpcodeText, connectedMessage)

	span.AddEvent("ws-conn-send_ack")

	connEventData, _ := sonic.Marshal(ConnCtx)

	span.AddEvent("ws-conn-presence_scheduled")

	// presence bookkeeping and the cluster announcement run outside the read
	// loop, the event is published only after presence is visible, otherwise
	// a service reacting to it could still read the socket as offline
	go func() {
		if manager.presenceEnabled() {
			ConnCtx.RunPresenceUpdate(func() {
				manager.presenceTrack(ConnCtx)
			})
		}

		manager.Nats.PublishToGlobal(
			&unats.UpstreamPayload{
				Event: "connection",
				Data:  connEventData,
			},
		)
	}()
}
