package structs

import (
	"testing"
	"time"
)

func TestPresenceUpdateOrdering(t *testing.T) {
	ctx := &WSConnectionCtx{}

	updateStarted := make(chan struct{})
	updateRelease := make(chan struct{})
	updateDone := make(chan struct{})

	go ctx.RunPresenceUpdate(func() {
		close(updateStarted)
		<-updateRelease
		close(updateDone)
	})

	<-updateStarted

	closeDone := make(chan struct{})

	go ctx.ClosePresence(func() {
		close(closeDone)
	})

	// the close cleanup must wait for the running update
	select {
	case <-closeDone:
		t.Fatal("close ran before the update finished")
	case <-time.After(50 * time.Millisecond):
	}

	close(updateRelease)
	<-updateDone

	select {
	case <-closeDone:
	case <-time.After(time.Second):
		t.Fatal("close did not run after the update finished")
	}

	// updates after close are ignored
	ranAfterClose := false
	ctx.RunPresenceUpdate(func() {
		ranAfterClose = true
	})

	if ranAfterClose {
		t.Fatal("update ran after the presence was closed")
	}
}

func TestPresenceCloseIsIdempotent(t *testing.T) {
	ctx := &WSConnectionCtx{}
	calls := 0

	ctx.ClosePresence(func() { calls++ })
	ctx.ClosePresence(func() { calls++ })

	if calls != 1 {
		t.Fatalf("expected one cleanup call, got %d", calls)
	}
}

func TestUserIDAndConnectedAt(t *testing.T) {
	ctx := &WSConnectionCtx{}

	if ctx.UserID() != "" {
		t.Fatalf("expected empty user id, got %q", ctx.UserID())
	}

	ctx.Meta = map[string]string{"user_id": "u1"}
	ctx.InitHeartbeat(1700000000)

	if ctx.UserID() != "u1" {
		t.Fatalf("expected user id u1, got %q", ctx.UserID())
	}

	if ctx.ConnectedAt() != 1700000000 {
		t.Fatalf("expected connected at 1700000000, got %d", ctx.ConnectedAt())
	}
}
