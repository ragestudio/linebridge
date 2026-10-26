package control_api

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/lxzan/gws"
)

type testGwsHandler struct {
	messages chan []byte
}

func (handler *testGwsHandler) OnOpen(conn *gws.Conn) {}

func (handler *testGwsHandler) OnClose(conn *gws.Conn, err error) {}

func (handler *testGwsHandler) OnPing(conn *gws.Conn, payload []byte) {}

func (handler *testGwsHandler) OnPong(conn *gws.Conn, payload []byte) {}

func (handler *testGwsHandler) OnMessage(conn *gws.Conn, message *gws.Message) {
	payload := make([]byte, len(message.Bytes()))
	copy(payload, message.Bytes())
	handler.messages <- payload
	message.Close()
}

func waitForEvent(t *testing.T, messages <-chan []byte, eventType string) map[string]any {
	t.Helper()

	deadline := time.After(3 * time.Second)

	for {
		select {
		case message := <-messages:
			payload := map[string]any{}

			if err := json.Unmarshal(message, &payload); err != nil {
				t.Fatalf("invalid event payload: %v", err)
			}

			if payload["type"] == eventType {
				return payload
			}
		case <-deadline:
			t.Fatalf("timed out waiting for the %s event", eventType)
		}
	}
}

func TestControlStream(t *testing.T) {
	api, hub, server := newTestAPI(t)

	api.upgrader = gws.NewUpgrader(&wsHandler{api: api}, &gws.ServerOption{
		Recovery: gws.Recovery,
	})

	handler := &testGwsHandler{messages: make(chan []byte, 32)}
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/ws"

	conn, _, err := gws.NewClient(handler, &gws.ClientOption{Addr: url})

	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}

	defer conn.WriteClose(1000, nil)

	go conn.ReadLoop()

	hello := waitForEvent(t, handler.messages, "hello")
	data, ok := hello["data"].(map[string]any)

	if !ok || data["mode"] != "dev" {
		t.Fatalf("unexpected hello payload %v", hello)
	}

	hub.Write("gateway", "", "streamed line")

	event := waitForEvent(t, handler.messages, "log")
	logData, ok := event["data"].(map[string]any)

	if !ok || logData["message"] != "streamed line" {
		t.Fatalf("unexpected log payload %v", event)
	}
}
