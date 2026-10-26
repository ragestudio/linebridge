package logs

import "testing"

func TestHubStripsLoggerTimestamp(t *testing.T) {
	hub := NewHub()

	hub.Write("gateway", "", "2026/10/26 13:39:51 gateway message")
	hub.Write("service:users", "stdout", "2026/10/26 13:39:51 service message")

	gatewayLines := hub.Tail("gateway", 1)

	if gatewayLines[0].Message != "gateway message" {
		t.Fatalf("expected the timestamp to be stripped, got %q", gatewayLines[0].Message)
	}

	serviceLines := hub.Tail("service:users", 1)

	if serviceLines[0].Message != "2026/10/26 13:39:51 service message" {
		t.Fatalf("service lines must keep their content, got %q", serviceLines[0].Message)
	}
}
