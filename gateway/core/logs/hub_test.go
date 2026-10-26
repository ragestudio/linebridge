package logs

import (
	"fmt"
	"testing"
	"time"
)

func TestHubTailByScope(t *testing.T) {
	hub := NewHub()

	hub.Write("gateway", "", "boot")
	hub.Write("service:users", "stdout", "listening")
	hub.Write("service:users", "stderr", "warning")
	hub.Write("service:chats", "stdout", "ready")

	if lines := hub.Tail("gateway", 10); len(lines) != 1 || lines[0].Message != "boot" {
		t.Fatalf("unexpected gateway tail %v", lines)
	}

	lines := hub.Tail("service:users", 10)

	if len(lines) != 2 {
		t.Fatalf("expected two user lines, got %d", len(lines))
	}

	if lines[1].Stream != "stderr" || lines[1].Message != "warning" {
		t.Fatalf("unexpected last line %+v", lines[1])
	}

	if lines := hub.Tail("all", 10); len(lines) != 4 {
		t.Fatalf("expected four combined lines, got %d", len(lines))
	}
}

func TestHubRingKeepsNewestLines(t *testing.T) {
	hub := NewHub()

	for i := 0; i < scopeBufferSize+50; i++ {
		hub.Write("gateway", "", fmt.Sprintf("line-%d", i))
	}

	lines := hub.Tail("gateway", 5)

	if len(lines) != 5 {
		t.Fatalf("expected five lines, got %d", len(lines))
	}

	if lines[4].Message != fmt.Sprintf("line-%d", scopeBufferSize+49) {
		t.Fatalf("expected the newest line last, got %q", lines[4].Message)
	}
}

func TestHubSubscribeAndUnsubscribe(t *testing.T) {
	hub := NewHub()
	channel, cancel := hub.Subscribe()

	hub.Write("gateway", "", "hello")

	select {
	case line := <-channel:
		if line.Message != "hello" {
			t.Fatalf("unexpected line %q", line.Message)
		}
	case <-time.After(time.Second):
		t.Fatal("did not receive the line")
	}

	cancel()
}

func TestHubWriter(t *testing.T) {
	hub := NewHub()
	writer := hub.Writer("gateway", "")

	if _, err := writer.Write([]byte("from writer\n")); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := hub.Tail("gateway", 10)

	if len(lines) != 1 || lines[0].Message != "from writer" {
		t.Fatalf("unexpected lines %v", lines)
	}
}

func TestHubClear(t *testing.T) {
	hub := NewHub()
	hub.Write("gateway", "", "one")
	hub.Clear()

	if lines := hub.Tail("all", 10); len(lines) != 0 {
		t.Fatalf("expected empty buffer, got %v", lines)
	}
}
