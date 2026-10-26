package services

import (
	"testing"
)

func resetShutdown(t *testing.T) {
	t.Helper()

	shuttingDown.Store(false)
	t.Cleanup(func() {
		shuttingDown.Store(false)
	})
}

func TestStartBlockedDuringShutdown(t *testing.T) {
	resetShutdown(t)

	service := NewService(&NewServiceOptions{
		Id:       "users",
		MainPath: "/tmp/users.service.js",
		Cwd:      t.TempDir(),
	})

	if service == nil {
		t.Fatal("failed to create the service")
	}

	BeginShutdown()

	if err := service.Start(); err == nil {
		t.Fatal("expected start to be blocked during shutdown")
	}

	service.Restart()

	if service.IsRunning() {
		t.Fatal("service should not be running")
	}

	if starts := service.Snapshot().Starts; starts != 0 {
		t.Fatalf("expected no starts, got %d", starts)
	}
}

func TestPrepareShutdownDisablesWatcher(t *testing.T) {
	resetShutdown(t)

	service := NewService(&NewServiceOptions{
		Id:            "users",
		MainPath:      "/tmp/users.service.js",
		Cwd:           t.TempDir(),
		EnableWatcher: true,
	})

	if service == nil {
		t.Fatal("failed to create the service")
	}

	if !service.Snapshot().Watcher {
		t.Fatal("expected the watcher to be attached")
	}

	BeginShutdown()
	service.PrepareShutdown()

	if service.Snapshot().Watcher {
		t.Fatal("expected the watcher to be detached")
	}

	select {
	case <-service.ctx.Done():
	default:
		t.Fatal("expected the lifecycle context to be cancelled")
	}

	service.Restart()

	if service.IsRunning() {
		t.Fatal("restart must not start the process while shutting down")
	}
}

func TestForceStopWithoutProcess(t *testing.T) {
	resetShutdown(t)

	service := NewService(&NewServiceOptions{
		Id:       "users",
		MainPath: "/tmp/users.service.js",
		Cwd:      t.TempDir(),
	})

	if service == nil {
		t.Fatal("failed to create the service")
	}

	service.ForceStop()

	if service.IsRunning() {
		t.Fatal("service should not be running")
	}
}
