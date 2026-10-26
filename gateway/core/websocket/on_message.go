package websocket

import (
	"bytes"
	"context"
	unats "ultragateway/core/nats"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type authResponse struct {
	Event string         `json:"event"`
	Data  map[string]any `json:"data"`
	Ack   bool           `json:"ack"`
}

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
			netConn.Close()
		}
		return
	}

	connCtx.Touch()

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
		manager.OnClientPing(conn)
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

		authCtx, oldUserID, authErr := manager.Connections.Authenticate(conn, newToken)

		if authErr != nil {
			manager.writeJSON(conn, authResponse{
				Event: "authenticate",
				Data:  map[string]any{"error": authErr.Error()},
				Ack:   true,
			})
			return
		}

		connCtx = authCtx

		// the token may belong to a different user than the handshake token
		if oldUserID != connCtx.UserID() && manager.presenceEnabled() {
			go connCtx.RunPresenceUpdate(func() {
				manager.presenceSwitchUser(connCtx, oldUserID)
			})
		}

		manager.writeJSON(conn, authResponse{
			Event: "authenticate",
			Data:  map[string]any{"ok": true},
			Ack:   true,
		})

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

	// the message buffer is returned to the gws pool when this handler
	// returns, so the payload is copied before handing it to the async nats
	// publisher
	payload := sonic.NoCopyRawMessage(bytes.Clone(message.Bytes()))

	manager.Nats.PublishToIPC(&unats.UpstreamPayload{
		Header: headers,
		Event:  event,
		Data:   payload,
	})

	span.AddEvent("ws-msg-ipc_pub")
}

func (manager *Instance) writeJSON(conn *gws.Conn, value any) {
	payload, err := sonic.Marshal(value)

	if err != nil {
		return
	}

	_ = conn.WriteMessage(gws.OpcodeText, payload)
}
