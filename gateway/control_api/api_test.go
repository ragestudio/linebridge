package control_api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
	"ultragateway/core/logs"
	"ultragateway/core/services"
	"ultragateway/structs"
)

func newTestAPI(t *testing.T) (*ControlAPI, *logs.Hub, *httptest.Server) {
	t.Helper()

	hub := logs.NewHub()
	serviceMap := map[string]*services.Service{}

	api := &ControlAPI{
		options: NewControlAPIOptions{
			Config:        &structs.BaseConfig{Mode: "dev"},
			Services:      &serviceMap,
			Logs:          hub,
			Version:       "test",
			StartTime:     time.Now(),
			HttpPathsRefs: &sync.Map{},
		},
		addr:    "127.0.0.1:9999",
		sampler: newProcSampler(),
		ui:      resolveUIFS(),
	}

	api.mux = api.buildRouter()

	server := httptest.NewServer(api.Handler())
	t.Cleanup(server.Close)

	return api, hub, server
}

func getJSON(t *testing.T, url string) map[string]any {
	t.Helper()

	response, err := http.Get(url)

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d: %s", response.StatusCode, string(body))
	}

	payload := map[string]any{}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}

	return payload
}

func TestControlHealth(t *testing.T) {
	_, _, server := newTestAPI(t)

	payload := getJSON(t, server.URL+"/api/health")

	if payload["ok"] != true {
		t.Fatalf("expected ok, got %v", payload)
	}

	if payload["mode"] != "dev" {
		t.Fatalf("expected dev mode, got %v", payload["mode"])
	}
}

func TestControlLogs(t *testing.T) {
	_, hub, server := newTestAPI(t)

	hub.Write("gateway", "", "hello from the gateway")
	hub.Write("service:users", "stdout", "listening")

	payload := getJSON(t, server.URL+"/api/logs?scope=all")

	lines, ok := payload["lines"].([]any)

	if !ok || len(lines) != 2 {
		t.Fatalf("expected two lines, got %v", payload["lines"])
	}

	scoped := getJSON(t, server.URL+"/api/logs?scope=service:users")
	scopedLines, _ := scoped["lines"].([]any)

	if len(scopedLines) != 1 {
		t.Fatalf("expected one scoped line, got %v", scopedLines)
	}

	request, _ := http.NewRequest(http.MethodDelete, server.URL+"/api/logs", nil)
	response, err := http.DefaultClient.Do(request)

	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	response.Body.Close()

	if lines := hub.Tail("all", 10); len(lines) != 0 {
		t.Fatalf("expected the buffer to be empty, got %d", len(lines))
	}
}

func TestControlServicesEmpty(t *testing.T) {
	_, _, server := newTestAPI(t)

	payload := getJSON(t, server.URL+"/api/services")
	servicesList, ok := payload["services"].([]any)

	if !ok || len(servicesList) != 0 {
		t.Fatalf("expected an empty service list, got %v", payload["services"])
	}
}

func TestControlServiceNotFound(t *testing.T) {
	_, _, server := newTestAPI(t)

	response, err := http.Post(server.URL+"/api/services/unknown/start", "application/json", nil)

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", response.StatusCode)
	}
}

func TestControlServiceDetail(t *testing.T) {
	api, _, server := newTestAPI(t)

	service := services.NewService(&services.NewServiceOptions{
		Id:       "users",
		MainPath: "/tmp/users.js",
		Env: map[string]string{
			"NODE_ENV":   "dev",
			"PORT":       "3000",
			"JWT_SECRET": "do-not-print",
		},
	})

	if service == nil {
		t.Fatal("failed to create the test service")
	}

	service.SetRegistration(services.Registration{
		Namespace:    "users",
		HTTPEnabled:  true,
		HTTPProto:    "http",
		Paths:        []string{"/users/self"},
		Routes:       []services.Route{{Method: "GET", Path: "/users/self"}},
		WSEnabled:    true,
		WSProto:      "ws",
		WSPath:       "/users",
		WSEvents:     []string{"user:update"},
		IP:           "127.0.0.1",
		Port:         3001,
		RegisteredAt: time.Now().Unix(),
	})

	(*api.options.Services)["users"] = service
	api.options.HttpPathsRefs.Store("users", "users")

	payload := getJSON(t, server.URL+"/api/services/users")

	if payload["id"] != "users" {
		t.Fatalf("unexpected service detail %v", payload)
	}

	env, _ := payload["env"].([]any)
	redacted := false

	for _, item := range env {
		entry, _ := item.(map[string]any)

		if entry["key"] == "JWT_SECRET" {
			redacted = entry["redacted"] == true && entry["value"] == "[redacted]"
		}
	}

	if !redacted {
		t.Fatalf("expected JWT_SECRET to be redacted, got %v", env)
	}

	routes, _ := payload["routes"].([]any)

	if len(routes) != 1 {
		t.Fatalf("expected one route, got %v", routes)
	}

	if route, _ := routes[0].(map[string]any); route["method"] != "GET" || route["path"] != "/users/self" {
		t.Fatalf("unexpected route %v", routes[0])
	}

	prefixes, _ := payload["http_prefixes"].([]any)

	if len(prefixes) != 1 || prefixes[0] != "users" {
		t.Fatalf("unexpected http prefixes %v", prefixes)
	}
}

func TestControlServiceDetailNotFound(t *testing.T) {
	_, _, server := newTestAPI(t)

	response, err := http.Get(server.URL + "/api/services/unknown")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", response.StatusCode)
	}
}

func TestControlWebsocketEmpty(t *testing.T) {
	_, _, server := newTestAPI(t)

	payload := getJSON(t, server.URL+"/api/websocket")

	if payload["count"].(float64) != 0 {
		t.Fatalf("expected no connections, got %v", payload["count"])
	}
}

func TestControlPresenceListEmpty(t *testing.T) {
	_, _, server := newTestAPI(t)

	payload := getJSON(t, server.URL+"/api/presence")

	if payload["count"].(float64) != 0 {
		t.Fatalf("expected no users, got %v", payload["count"])
	}

	if payload["enabled"] != false {
		t.Fatalf("expected presence to be disabled, got %v", payload["enabled"])
	}
}

func TestControlCORS(t *testing.T) {
	_, _, server := newTestAPI(t)

	request, _ := http.NewRequest(http.MethodGet, server.URL+"/api/health", nil)
	request.Header.Set("Origin", "http://evil.example")

	response, err := http.DefaultClient.Do(request)

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	response.Body.Close()

	if origin := response.Header.Get("Access-Control-Allow-Origin"); origin != "" {
		t.Fatalf("unexpected cors origin for an external page: %q", origin)
	}

	request, _ = http.NewRequest(http.MethodGet, server.URL+"/api/health", nil)
	request.Header.Set("Origin", "http://localhost:9999")

	response, err = http.DefaultClient.Do(request)

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	response.Body.Close()

	if origin := response.Header.Get("Access-Control-Allow-Origin"); origin != "http://localhost:9999" {
		t.Fatalf("expected the local origin to be allowed, got %q", origin)
	}
}

func TestControlPresenceWithoutRedis(t *testing.T) {
	_, _, server := newTestAPI(t)

	payload := getJSON(t, server.URL+"/api/presence/user-1")

	if payload["user_id"] != "user-1" {
		t.Fatalf("unexpected payload %v", payload)
	}

	memory, ok := payload["memory"].(map[string]any)

	if !ok || memory["connected"] != false {
		t.Fatalf("expected no memory connections, got %v", payload["memory"])
	}
}

func TestControlRedisDisabled(t *testing.T) {
	_, _, server := newTestAPI(t)

	response, err := http.Get(server.URL + "/api/redis/info")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", response.StatusCode)
	}
}

func TestControlUI(t *testing.T) {
	_, _, server := newTestAPI(t)

	client := &http.Client{
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	response, err := client.Get(server.URL + "/")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	response.Body.Close()

	if response.StatusCode != http.StatusFound || response.Header.Get("Location") != "/ui/" {
		t.Fatalf("expected a redirect to /ui/, got %d %s", response.StatusCode, response.Header.Get("Location"))
	}

	response, err = http.Get(server.URL + "/ui/")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	if !strings.HasPrefix(response.Header.Get("Content-Type"), "text/html") {
		t.Fatalf("unexpected content type %q", response.Header.Get("Content-Type"))
	}

	if !strings.Contains(string(body), "Linebridge Control") {
		t.Fatal("the ui placeholder was not served")
	}
}

func TestControlUIAssets(t *testing.T) {
	_, _, server := newTestAPI(t)

	assets := map[string]string{
		"/ui/app.js":                      "javascript",
		"/ui/styles.css":                  "css",
		"/ui/vendor/preact.module.js":     "javascript",
		"/ui/vendor/hooks.module.js":      "javascript",
		"/ui/vendor/htm.module.js":        "javascript",
		"/ui/components/Overview.js":      "javascript",
		"/ui/components/ServiceDetail.js": "javascript",
	}

	for path, contentType := range assets {
		response, err := http.Get(server.URL + path)

		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}

		response.Body.Close()

		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", path, response.StatusCode)
		}

		if actual := response.Header.Get("Content-Type"); !strings.Contains(actual, contentType) {
			t.Fatalf("unexpected content type for %s: %q", path, actual)
		}
	}

	// unknown ui paths fall back to the single page shell
	response, err := http.Get(server.URL + "/ui/any/route")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)

	if !strings.Contains(string(body), "Linebridge Control") {
		t.Fatal("expected the spa fallback to serve index.html")
	}
}

func TestControlUnknownRoute(t *testing.T) {
	_, _, server := newTestAPI(t)

	response, err := http.Get(server.URL + "/api/does-not-exist")

	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", response.StatusCode)
	}
}
