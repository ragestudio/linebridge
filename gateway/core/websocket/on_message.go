package websocket

import (
	"context"
	"time"
	unats "ultragateway/core/nats"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func (manager *Instance) OnMessage(conn *gws.Conn, message *gws.Message) {
	_, span := OTELTracer.Start(context.Background(), "ws-msg",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()
	defer message.Close()

	connCtx, ok := manager.Connections.LoadConnCtx(conn)
	netConn := conn.NetConn()

	if !ok {
		if netConn != nil {
			conn.NetConn().Close()
		}
		return
	}

	connCtx.LastSeen = time.Now().Unix()

	span.AddEvent("ws-msg-load_ctx", trace.WithAttributes(
		attribute.String("socket_id", connCtx.ID),
	))

	var event string

	if ast, err := sonic.Get(message.Bytes(), "event"); err == nil {
		event, _ = ast.String()
	}

	span.AddEvent("ws-msg-event_parse", trace.WithAttributes(
		attribute.String("event", event),
	))

	if event == "" {
		return
	}

	if event == "ping" {
		manager.OnPing(conn, message.Bytes())
		return
	}

	if event == "authenticate" {
		tokenAst, err := sonic.Get(message.Bytes(), "data")

		if err != nil {
			return
		}

		var newToken string

		if newToken, err = tokenAst.String(); err != nil {
			return
		}

		if connCtx, err = manager.Connections.Authenticate(conn, newToken); err != nil {
			conn.WriteMessage(gws.OpcodeText, []byte(`{"event": "authenticate", "data": { "error": "`+err.Error()+`" }, "ack": true }`))

			return
		}

		conn.WriteMessage(gws.OpcodeText, []byte(`{"event": "authenticate", "data": { "ok": true }, "ack": true}`))

		return
	}

	headers := nats.Header{}

	// inject the meta keys to headers
	for key, value := range connCtx.Meta {
		headers.Add(key, value)
	}

	// add base headers
	headers.Add("event", event)
	headers.Add("token", connCtx.Token)
	headers.Add("socket_id", connCtx.ID)

	manager.Nats.PublishToIPC(&unats.UpstreamPayload{
		Header: headers,
		Event:  event,
		Data:   sonic.NoCopyRawMessage(message.Bytes()),
	})

	span.AddEvent("ws-msg-ipc_pub")
}
