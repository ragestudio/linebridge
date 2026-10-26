package app

import (
	"testing"
)

func TestRequestForceShutdown(t *testing.T) {
	instance := &App{forceShutdown: make(chan struct{})}

	if forceRequested(instance.forceShutdown) {
		t.Fatal("shutdown should not be forced yet")
	}

	instance.RequestForceShutdown("test")

	if !forceRequested(instance.forceShutdown) {
		t.Fatal("expected the force shutdown signal")
	}

	// calling it twice must be safe
	instance.RequestForceShutdown("test again")
}
