package topics

import (
	"strings"
	"testing"

	"github.com/lxzan/gws"
)

func TestManagerSubscribeAndCleanup(t *testing.T) {
	manager := NewManager(4)
	connA := &gws.Conn{}
	connB := &gws.Conn{}

	if err := manager.Subscribe("a", connA, "group:1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := manager.Subscribe("b", connB, "group:1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if count := manager.CountTopic("group:1"); count != 2 {
		t.Fatalf("expected 2 subscribers, got %d", count)
	}

	manager.Unsubscribe("a", "group:1")

	if count := manager.CountTopic("group:1"); count != 1 {
		t.Fatalf("expected 1 subscriber, got %d", count)
	}

	if count := manager.CountConn("a"); count != 0 {
		t.Fatalf("expected connection a to have no topics, got %d", count)
	}

	manager.Unsubscribe("b", "group:1")

	if count := manager.CountTopic("group:1"); count != 0 {
		t.Fatalf("expected topic to be removed, got %d", count)
	}
}

func TestManagerUnsubscribeAll(t *testing.T) {
	manager := NewManager(0)

	_ = manager.Subscribe("a", &gws.Conn{}, "one")
	_ = manager.Subscribe("a", &gws.Conn{}, "two")
	_ = manager.Subscribe("b", &gws.Conn{}, "two")

	manager.UnsubscribeAll("a")

	if count := manager.CountConn("a"); count != 0 {
		t.Fatalf("expected no topics for a, got %d", count)
	}

	if count := manager.CountTopic("one"); count != 0 {
		t.Fatalf("expected topic one to be removed, got %d", count)
	}

	if count := manager.CountTopic("two"); count != 1 {
		t.Fatalf("expected one subscriber left on topic two, got %d", count)
	}
}

func TestManagerLimits(t *testing.T) {
	manager := NewManager(1)
	conn := &gws.Conn{}

	if err := manager.Subscribe("a", conn, "one"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := manager.Subscribe("a", conn, "two"); err != ErrTopicLimit {
		t.Fatalf("expected limit error, got %v", err)
	}

	// subscribing twice to the same topic is a noop
	if err := manager.Subscribe("a", conn, "one"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := manager.Subscribe("a", conn, strings.Repeat("x", 300)); err != ErrTopicTooLong {
		t.Fatalf("expected topic length error, got %v", err)
	}
}
