package control_api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"ultragateway/core/logs"
	uredis "ultragateway/core/redis"
	"ultragateway/core/services"
	"ultragateway/structs"

	goredis "github.com/redis/go-redis/v9"
)

func newRedisTestAPI(t *testing.T) (*ControlAPI, *uredis.Instance, *httptest.Server) {
	t.Helper()

	url := os.Getenv("CONTROL_TEST_REDIS_URL")

	if url == "" {
		t.Skip("CONTROL_TEST_REDIS_URL is not set")
	}

	options, err := goredis.ParseURL(url)

	if err != nil {
		t.Fatalf("invalid redis url: %v", err)
	}

	client := goredis.NewClient(options)

	if err := client.FlushDB(context.Background()).Err(); err != nil {
		t.Fatalf("failed to flush test db: %v", err)
	}

	t.Cleanup(func() {
		client.Close()
	})

	serviceMap := map[string]*services.Service{}
	hub := logs.NewHub()

	api := &ControlAPI{
		options: NewControlAPIOptions{
			Config:    &structs.BaseConfig{Mode: "dev"},
			Services:  &serviceMap,
			Redis:     &uredis.Instance{Client: client},
			Logs:      hub,
			Version:   "test",
			StartTime: time.Now(),
		},
		addr:    "127.0.0.1:9999",
		sampler: newProcSampler(),
		ui:      resolveUIFS(),
	}

	api.mux = api.buildRouter()

	server := httptest.NewServer(api.Handler())
	t.Cleanup(server.Close)

	return api, &uredis.Instance{Client: client}, server
}

func TestControlRedisPresence(t *testing.T) {
	_, instance, server := newRedisTestAPI(t)
	ctx := context.Background()
	client := instance.Client

	client.SAdd(ctx, "presence:user:user-1", "socket-1")
	client.HSet(ctx, "presence:sockets:socket-1", "user_id", "user-1", "connected_at", "1700000000")
	client.ZAdd(ctx, "presence:global_users", goredis.Z{
		Score:  float64(time.Now().Add(time.Minute).Unix()),
		Member: "user-1",
	})

	payload := getJSON(t, server.URL+"/api/presence/user-1")
	redisData, ok := payload["redis"].(map[string]any)

	if !ok {
		t.Fatalf("expected redis data, got %v", payload)
	}

	members, ok := redisData["members"].([]any)

	if !ok || len(members) != 1 || members[0] != "socket-1" {
		t.Fatalf("unexpected members %v", redisData["members"])
	}

	sockets, ok := redisData["sockets"].(map[string]any)

	if !ok {
		t.Fatalf("expected sockets, got %v", redisData["sockets"])
	}

	socket, ok := sockets["socket-1"].(map[string]any)

	if !ok || socket["user_id"] != "user-1" {
		t.Fatalf("unexpected socket %v", sockets["socket-1"])
	}

	if score, ok := redisData["global_score"].(float64); !ok || score <= 0 {
		t.Fatalf("expected a global score, got %v", redisData["global_score"])
	}
}

func TestControlRedisInfoAndKeys(t *testing.T) {
	_, instance, server := newRedisTestAPI(t)
	ctx := context.Background()

	instance.Client.Set(ctx, "presence:test:key", "value", time.Minute)

	info := getJSON(t, server.URL+"/api/redis/info")

	if _, ok := info["info"].(string); !ok {
		t.Fatalf("expected raw info, got %v", info)
	}

	if info["dbsize"].(float64) < 1 {
		t.Fatalf("expected at least one key, got %v", info["dbsize"])
	}

	keys := getJSON(t, server.URL+"/api/redis/keys?pattern=presence:*")
	list, ok := keys["keys"].([]any)

	if !ok || len(list) == 0 {
		t.Fatalf("expected keys, got %v", keys["keys"])
	}

	first, ok := list[0].(map[string]any)

	if !ok || first["key"] != "presence:test:key" {
		t.Fatalf("unexpected key entry %v", list[0])
	}

	if first["type"] != "string" {
		t.Fatalf("expected a string key, got %v", first["type"])
	}
}

func TestControlRedisExec(t *testing.T) {
	_, instance, server := newRedisTestAPI(t)
	ctx := context.Background()

	instance.Client.SAdd(ctx, "presence:user:user-1", "socket-1")

	body, _ := json.Marshal(map[string]any{
		"command": "SMEMBERS",
		"args":    []string{"presence:user:user-1"},
	})

	response, err := http.Post(server.URL+"/api/redis/exec", "application/json", bytes.NewReader(body))

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	payload := map[string]any{}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}

	result, ok := payload["result"].([]any)

	if !ok || len(result) != 1 || result[0] != "socket-1" {
		t.Fatalf("unexpected result %v", payload["result"])
	}
}

func TestControlRedisExecDenied(t *testing.T) {
	_, _, server := newRedisTestAPI(t)

	body, _ := json.Marshal(map[string]any{"command": "FLUSHALL"})
	response, err := http.Post(server.URL+"/api/redis/exec", "application/json", bytes.NewReader(body))

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusForbidden {
		body, _ := json.Marshal(response)
		t.Fatalf("expected 403, got %d %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
}
