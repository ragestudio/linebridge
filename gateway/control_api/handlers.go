package control_api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
	"ultragateway/core/services"

	"github.com/redis/go-redis/v9"
)

type gatewayStats struct {
	Pid        int     `json:"pid"`
	CPUPercent float64 `json:"cpu_percent"`
	Memory     int64   `json:"memory_bytes"`
	Threads    int     `json:"threads"`
	Goroutines int     `json:"goroutines"`
	Uptime     int64   `json:"uptime"`
}

type runtimeStats struct {
	HeapAlloc    uint64  `json:"heap_alloc"`
	HeapInuse    uint64  `json:"heap_inuse"`
	HeapSys      uint64  `json:"heap_sys"`
	HeapObjects  uint64  `json:"heap_objects"`
	StackInuse   uint64  `json:"stack_inuse"`
	NumGC        uint32  `json:"num_gc"`
	PauseTotalMS float64 `json:"pause_total_ms"`
	AvgGCMS      float64 `json:"avg_gc_ms"`
	GOMAXPROCS   int     `json:"gomaxprocs"`
}

type hostStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	Load1         float64 `json:"load1"`
	Load5         float64 `json:"load5"`
	Load15        float64 `json:"load15"`
	MemoryTotal   int64   `json:"memory_total"`
	MemoryFree    int64   `json:"memory_available"`
	MemoryPercent float64 `json:"memory_percent"`
}

type websocketStats struct {
	Connections int `json:"connections"`
	Users       int `json:"users"`
}

type servicesSummary struct {
	Total   int `json:"total"`
	Running int `json:"running"`
}

type systemResponse struct {
	Timestamp int64           `json:"timestamp"`
	Mode      string          `json:"mode"`
	Version   string          `json:"version"`
	Gateway   gatewayStats    `json:"gateway"`
	Runtime   runtimeStats    `json:"runtime"`
	Host      hostStats       `json:"host"`
	Websocket websocketStats  `json:"websocket"`
	Services  servicesSummary `json:"services"`
}

type serviceView struct {
	ID          string  `json:"id"`
	Running     bool    `json:"running"`
	Pid         int     `json:"pid"`
	StartedAt   int64   `json:"started_at"`
	Uptime      int64   `json:"uptime"`
	Starts      int     `json:"starts"`
	MainPath    string  `json:"main_path"`
	Cwd         string  `json:"cwd"`
	Socket      string  `json:"socket,omitempty"`
	Watcher     bool    `json:"watcher"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryBytes int64   `json:"memory_bytes"`
	Threads     int     `json:"threads"`
}

type envEntry struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Redacted bool   `json:"redacted"`
}

type serviceDetailResponse struct {
	serviceView
	Env          []envEntry             `json:"env"`
	Registration *services.Registration `json:"registration,omitempty"`
	Routes       []services.Route       `json:"routes"`
	Paths        []string               `json:"paths"`
	HTTPPrefixes []string               `json:"http_prefixes"`
	WSEvents     []string               `json:"ws_events"`
	NatsEvents   []string               `json:"nats_events"`
	LogLines     int                    `json:"log_lines"`
}

// keys that must never be printed in clear on the control ui
var sensitiveEnvKey = regexp.MustCompile(`(?i)(secret|token|password|passwd|private|credential|api[_-]?key|access[_-]?key|jwt)`)

func sanitizeEnv(env map[string]string) []envEntry {
	entries := make([]envEntry, 0, len(env))

	for key, value := range env {
		entry := envEntry{Key: key, Value: value}

		if sensitiveEnvKey.MatchString(key) && value != "" {
			entry.Value = "[redacted]"
			entry.Redacted = true
		}

		entries = append(entries, entry)
	}

	sort.Slice(entries, func(left, right int) bool {
		return entries[left].Key < entries[right].Key
	})

	return entries
}

func (api *ControlAPI) handleHealth(writer http.ResponseWriter, request *http.Request) {
	servicesTotal := 0
	servicesRunning := 0

	if api.options.Services != nil {
		for _, service := range *api.options.Services {
			servicesTotal++

			if service.IsRunning() {
				servicesRunning++
			}
		}
	}

	connections, users := 0, 0

	if api.options.Websocket != nil {
		connections, users = api.options.Websocket.DebugStats()
	}

	natsConnected := false

	if api.options.Nats != nil && api.options.Nats.Client != nil {
		natsConnected = api.options.Nats.Client.IsConnected()
	}

	redisConnected := false

	if api.options.Redis != nil {
		ctx, cancel := context.WithTimeout(request.Context(), 300*time.Millisecond)
		redisConnected = api.options.Redis.Client.Ping(ctx).Err() == nil
		cancel()
	}

	mode := ""

	if api.options.Config != nil {
		mode = api.options.Config.Mode
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"ok":        true,
		"mode":      mode,
		"version":   api.options.Version,
		"uptime":    int64(time.Since(api.options.StartTime).Seconds()),
		"timestamp": time.Now().Unix(),
		"services": map[string]any{
			"total":   servicesTotal,
			"running": servicesRunning,
		},
		"websocket": map[string]any{
			"connections": connections,
			"users":       users,
		},
		"nats": map[string]any{
			"enabled":   api.options.Nats != nil,
			"connected": natsConnected,
		},
		"redis": map[string]any{
			"enabled":   api.options.Redis != nil,
			"connected": redisConnected,
		},
		"control_api": map[string]any{
			"listen": api.addr,
		},
	})
}

func (api *ControlAPI) handleConfig(writer http.ResponseWriter, request *http.Request) {
	if api.options.Config == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"error": "config not available"})
		return
	}

	config := api.options.Config

	writeJSON(writer, http.StatusOK, map[string]any{
		"mode": config.Mode,
		"http": map[string]any{
			"port":        config.Http.Port,
			"secure_port": config.Http.SecurePort,
			"tls":         config.Http.Certificates.Cert != "" && config.Http.Certificates.Key != "",
		},
		"ipc": map[string]any{
			"path": config.IPC.Path,
		},
		"redis": map[string]any{
			"enabled": config.Redis.Enabled,
			"url":     sanitizeURL(config.Redis.URL),
		},
		"presence": map[string]any{
			"enabled": config.Presence.Enabled,
		},
		"jwt": map[string]any{
			"use_keys":               config.JWT.UseKeys,
			"public_key_configured":  config.JWT.PublicKey != "",
			"private_key_configured": config.JWT.PrivateKey != "",
		},
		"scripts": config.Scripts,
		"routes":  config.Routes,
		"control_api": map[string]any{
			"enabled": config.ControlAPI.Enabled,
			"listen":  api.addr,
		},
	})
}

func sanitizeURL(raw string) string {
	if raw == "" {
		return ""
	}

	parsed, err := url.Parse(raw)

	if err != nil {
		return ""
	}

	parsed.User = nil

	return parsed.String()
}

func (api *ControlAPI) handleSystem(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, api.systemSnapshot())
}

func (api *ControlAPI) systemSnapshot() systemResponse {
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)

	gatewayUsage := api.sampler.usage(runtimePid())
	cpu, load1, load5, load15, memoryTotal, memoryAvailable := api.sampler.hostUsage()

	response := systemResponse{
		Timestamp: time.Now().Unix(),
		Version:   api.options.Version,
		Gateway: gatewayStats{
			Pid:        runtimePid(),
			CPUPercent: gatewayUsage.CPUPercent,
			Memory:     gatewayUsage.MemoryBytes,
			Threads:    gatewayUsage.Threads,
			Goroutines: runtime.NumGoroutine(),
			Uptime:     int64(time.Since(api.options.StartTime).Seconds()),
		},
		Runtime: runtimeStats{
			HeapAlloc:    memory.HeapAlloc,
			HeapInuse:    memory.HeapInuse,
			HeapSys:      memory.HeapSys,
			HeapObjects:  memory.HeapObjects,
			StackInuse:   memory.StackInuse,
			NumGC:        memory.NumGC,
			PauseTotalMS: float64(memory.PauseTotalNs) / 1e6,
			GOMAXPROCS:   runtime.GOMAXPROCS(0),
		},
		Host: hostStats{
			CPUPercent:  cpu,
			Load1:       load1,
			Load5:       load5,
			Load15:      load15,
			MemoryTotal: memoryTotal,
			MemoryFree:  memoryAvailable,
		},
	}

	if memoryTotal > 0 {
		response.Host.MemoryPercent = float64(memoryTotal-memoryAvailable) / float64(memoryTotal) * 100
	}

	if memory.NumGC > 0 {
		response.Runtime.AvgGCMS = float64(memory.PauseTotalNs) / float64(memory.NumGC) / 1e6
	}

	if api.options.Config != nil {
		response.Mode = api.options.Config.Mode
	}

	if api.options.Websocket != nil {
		response.Websocket.Connections, response.Websocket.Users = api.options.Websocket.DebugStats()
	}

	if api.options.Services != nil {
		response.Services.Total = len(*api.options.Services)

		for _, service := range *api.options.Services {
			if service.IsRunning() {
				response.Services.Running++
			}
		}
	}

	return response
}

func runtimePid() int {
	return os.Getpid()
}

func (api *ControlAPI) servicesView() []serviceView {
	if api.options.Services == nil {
		return []serviceView{}
	}

	services := make([]serviceView, 0, len(*api.options.Services))

	for _, service := range *api.options.Services {
		snapshot := service.Snapshot()
		usage := api.sampler.usage(snapshot.Pid)

		services = append(services, serviceView{
			ID:          snapshot.ID,
			Running:     snapshot.Running,
			Pid:         snapshot.Pid,
			StartedAt:   snapshot.StartedAt,
			Uptime:      snapshot.Uptime,
			Starts:      snapshot.Starts,
			MainPath:    snapshot.MainPath,
			Cwd:         snapshot.Cwd,
			Socket:      snapshot.Socket,
			Watcher:     snapshot.Watcher,
			CPUPercent:  usage.CPUPercent,
			MemoryBytes: usage.MemoryBytes,
			Threads:     usage.Threads,
		})
	}

	sort.Slice(services, func(left, right int) bool {
		return services[left].ID < services[right].ID
	})

	return services
}

func (api *ControlAPI) handleServices(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{
		"services": api.servicesView(),
	})
}

func (api *ControlAPI) handleServiceDetail(writer http.ResponseWriter, request *http.Request) {
	service, ok := api.service(request)

	if !ok {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "service not found"})
		return
	}

	snapshot := service.Snapshot()
	usage := api.sampler.usage(snapshot.Pid)

	response := serviceDetailResponse{
		serviceView: serviceView{
			ID:          snapshot.ID,
			Running:     snapshot.Running,
			Pid:         snapshot.Pid,
			StartedAt:   snapshot.StartedAt,
			Uptime:      snapshot.Uptime,
			Starts:      snapshot.Starts,
			MainPath:    snapshot.MainPath,
			Cwd:         snapshot.Cwd,
			Socket:      snapshot.Socket,
			Watcher:     snapshot.Watcher,
			CPUPercent:  usage.CPUPercent,
			MemoryBytes: usage.MemoryBytes,
			Threads:     usage.Threads,
		},
		Env:          sanitizeEnv(service.EnvSnapshot()),
		Routes:       []services.Route{},
		Paths:        []string{},
		HTTPPrefixes: []string{},
		WSEvents:     []string{},
		NatsEvents:   []string{},
	}

	if registration, registered := service.Registration(); registered {
		response.Registration = &registration

		if len(registration.Routes) > 0 {
			response.Routes = registration.Routes
		}

		if len(registration.Paths) > 0 {
			response.Paths = registration.Paths
		}

		if len(registration.WSEvents) > 0 {
			response.WSEvents = registration.WSEvents
		}

		if response.Socket == "" {
			response.Socket = registration.Socket
		}

		if len(response.Routes) == 0 {
			// services that do not advertise routes per method fall back to paths
			for _, path := range registration.Paths {
				response.Routes = append(response.Routes, services.Route{Method: "ANY", Path: path})
			}
		}
	}

	if api.options.Nats != nil {
		response.NatsEvents = api.options.Nats.ServiceEvents(snapshot.ID)
	}

	if api.options.HttpPathsRefs != nil {
		api.options.HttpPathsRefs.Range(func(key, value any) bool {
			if value == snapshot.ID {
				if prefix, ok := key.(string); ok {
					response.HTTPPrefixes = append(response.HTTPPrefixes, prefix)
				}
			}

			return true
		})

		sort.Strings(response.HTTPPrefixes)
	}

	if api.options.Logs != nil {
		response.LogLines = api.options.Logs.Count("service:" + snapshot.ID)
	}

	writeJSON(writer, http.StatusOK, response)
}

func (api *ControlAPI) service(request *http.Request) (*services.Service, bool) {
	id := request.PathValue("id")

	if api.options.Services == nil {
		return nil, false
	}

	service, ok := (*api.options.Services)[id]

	return service, ok
}

func (api *ControlAPI) handleServiceStart(writer http.ResponseWriter, request *http.Request) {
	service, ok := api.service(request)

	if !ok {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "service not found"})
		return
	}

	if err := service.Start(); err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"ok":      true,
		"service": service.Snapshot(),
	})
}

func (api *ControlAPI) handleServiceStop(writer http.ResponseWriter, request *http.Request) {
	service, ok := api.service(request)

	if !ok {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "service not found"})
		return
	}

	if err := service.Stop(); err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"ok":      true,
		"service": service.Snapshot(),
	})
}

func (api *ControlAPI) handleServiceRestart(writer http.ResponseWriter, request *http.Request) {
	service, ok := api.service(request)

	if !ok {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "service not found"})
		return
	}

	service.Restart()

	writeJSON(writer, http.StatusOK, map[string]any{
		"ok":      true,
		"service": service.Snapshot(),
	})
}

func (api *ControlAPI) handleLogs(writer http.ResponseWriter, request *http.Request) {
	if api.options.Logs == nil {
		writeJSON(writer, http.StatusOK, map[string]any{"scope": "all", "lines": []any{}})
		return
	}

	scope := request.URL.Query().Get("scope")

	if scope == "" {
		scope = "all"
	}

	limit := 500

	if raw := request.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = min(parsed, 2000)
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"scope":   scope,
		"lines":   api.options.Logs.Tail(scope, limit),
		"scopes":  api.options.Logs.Scopes(),
		"dropped": api.options.Logs.Dropped(),
	})
}

func (api *ControlAPI) handleLogsClear(writer http.ResponseWriter, request *http.Request) {
	if api.options.Logs == nil {
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		return
	}

	api.options.Logs.Clear()

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (api *ControlAPI) handleWebsocket(writer http.ResponseWriter, request *http.Request) {
	if api.options.Websocket == nil {
		writeJSON(writer, http.StatusOK, map[string]any{
			"connections": []any{},
			"count":       0,
			"users":       0,
		})
		return
	}

	connections := api.options.Websocket.DebugConnections()
	count, users := api.options.Websocket.DebugStats()

	writeJSON(writer, http.StatusOK, map[string]any{
		"connections": connections,
		"count":       count,
		"users":       users,
	})
}

func (api *ControlAPI) handleWebsocketConnection(writer http.ResponseWriter, request *http.Request) {
	if api.options.Websocket == nil {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "websocket manager not available"})
		return
	}

	socketID := request.PathValue("id")

	for _, connection := range api.options.Websocket.DebugConnections() {
		if connection.SocketID == socketID {
			writeJSON(writer, http.StatusOK, connection)
			return
		}
	}

	writeJSON(writer, http.StatusNotFound, map[string]any{"error": "connection not found"})
}

func (api *ControlAPI) handleWebsocketClose(writer http.ResponseWriter, request *http.Request) {
	if api.options.Websocket == nil {
		writeJSON(writer, http.StatusNotFound, map[string]any{"error": "websocket manager not available"})
		return
	}

	payload := struct {
		Code   int    `json:"code"`
		Reason string `json:"reason"`
	}{Code: 1000}

	if err := readJSON(request, &payload); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(writer, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	if payload.Code < 1000 || payload.Code > 4999 {
		payload.Code = 1000
	}

	if api.options.Websocket.CloseConnection(request.PathValue("id"), uint16(payload.Code), payload.Reason) {
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		return
	}

	writeJSON(writer, http.StatusNotFound, map[string]any{"error": "connection not found"})
}

func (api *ControlAPI) handlePresenceList(writer http.ResponseWriter, request *http.Request) {
	users := make(map[string][]string)

	if api.options.Websocket != nil {
		for _, connection := range api.options.Websocket.DebugConnections() {
			if connection.UserID == "" {
				continue
			}

			users[connection.UserID] = append(users[connection.UserID], connection.SocketID)
		}
	}

	list := make([]map[string]any, 0, len(users))

	for userID, sockets := range users {
		list = append(list, map[string]any{
			"user_id":     userID,
			"connections": len(sockets),
			"sockets":     sockets,
		})
	}

	sort.Slice(list, func(left, right int) bool {
		return list[left]["user_id"].(string) < list[right]["user_id"].(string)
	})

	writeJSON(writer, http.StatusOK, map[string]any{
		"users":   list,
		"count":   len(list),
		"enabled": api.options.Websocket != nil && api.options.Websocket.PresenceEnabled,
	})
}

func (api *ControlAPI) handlePresence(writer http.ResponseWriter, request *http.Request) {
	userID := request.PathValue("id")
	presenceEnabled := api.options.Websocket != nil && api.options.Websocket.PresenceEnabled
	response := map[string]any{
		"user_id": userID,
		"enabled": presenceEnabled,
		"memory": map[string]any{
			"connected": false,
			"sockets":   []any{},
		},
	}

	memorySockets := make([]map[string]any, 0)

	if api.options.Websocket != nil {
		for _, connection := range api.options.Websocket.DebugConnections() {
			if connection.UserID != userID {
				continue
			}

			memorySockets = append(memorySockets, map[string]any{
				"socket_id":    connection.SocketID,
				"connected_at": connection.ConnectedAt,
				"last_seen":    connection.LastSeen,
				"topics":       connection.Topics,
			})
		}
	}

	response["memory"] = map[string]any{
		"connected": len(memorySockets) > 0,
		"sockets":   memorySockets,
	}

	if api.options.Redis != nil && presenceEnabled {
		response["redis"] = api.presenceFromRedis(request.Context(), userID)
	}

	writeJSON(writer, http.StatusOK, response)
}

func (api *ControlAPI) presenceFromRedis(parent context.Context, userID string) map[string]any {
	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()

	client := api.options.Redis.Client
	userKey := "presence:user:" + userID

	members, err := client.SMembers(ctx, userKey).Result()

	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	sockets := make(map[string]any, len(members))

	if len(members) > 0 {
		pipe := client.Pipeline()

		for _, socketID := range members {
			pipe.HGetAll(ctx, "presence:sockets:"+socketID)
		}

		results, _ := pipe.Exec(ctx)

		for index, socketID := range members {
			if index >= len(results) {
				continue
			}

			if cmd, ok := results[index].(*redis.MapStringStringCmd); ok {
				sockets[socketID] = cmd.Val()
			}
		}
	}

	userTTL, _ := client.PTTL(ctx, userKey).Result()
	globalScore, _ := client.ZScore(ctx, "presence:global_users", userID).Result()

	return map[string]any{
		"user_key":     userKey,
		"members":      members,
		"sockets":      sockets,
		"user_ttl_ms":  userTTL.Milliseconds(),
		"global_score": globalScore,
	}
}

func (api *ControlAPI) handleRedisInfo(writer http.ResponseWriter, request *http.Request) {
	if api.options.Redis == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"error": "redis is not enabled"})
		return
	}

	ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()

	client := api.options.Redis.Client

	start := time.Now()
	pingError := client.Ping(ctx).Err()
	pingMS := float64(time.Since(start).Microseconds()) / 1000

	if pingError != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"error": pingError.Error()})
		return
	}

	info, _ := client.Info(ctx).Result()
	dbsize, _ := client.DBSize(ctx).Result()

	writeJSON(writer, http.StatusOK, map[string]any{
		"ping_ms": pingMS,
		"dbsize":  dbsize,
		"info":    info,
		"summary": parseInfoSummary(info),
	})
}

func parseInfoSummary(info string) map[string]string {
	summary := make(map[string]string)

	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)

		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)

		if len(parts) != 2 {
			continue
		}

		switch parts[0] {
		case "redis_version", "dragonfly_version", "connected_clients", "used_memory_human",
			"used_memory_peak_human", "total_commands_processed", "instantaneous_ops_per_sec",
			"keyspace_hits", "keyspace_misses", "uptime_in_seconds":
			summary[parts[0]] = parts[1]
		default:
			if strings.HasPrefix(parts[0], "db") {
				summary[parts[0]] = parts[1]
			}
		}
	}

	return summary
}

func (api *ControlAPI) handleRedisKeys(writer http.ResponseWriter, request *http.Request) {
	if api.options.Redis == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"error": "redis is not enabled"})
		return
	}

	pattern := request.URL.Query().Get("pattern")

	if pattern == "" {
		pattern = "*"
	}

	limit := 100

	if raw := request.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = min(parsed, 500)
		}
	}

	ctx, cancel := context.WithTimeout(request.Context(), 3*time.Second)
	defer cancel()

	client := api.options.Redis.Client
	keys := make([]string, 0, limit)
	cursor := uint64(0)

	for len(keys) < limit {
		batch, next, err := client.Scan(ctx, cursor, pattern, int64(limit)).Result()

		if err != nil {
			writeJSON(writer, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}

		keys = append(keys, batch...)
		cursor = next

		if cursor == 0 {
			break
		}
	}

	if len(keys) > limit {
		keys = keys[:limit]
	}

	type keyInfo struct {
		Key    string `json:"key"`
		Type   string `json:"type"`
		TTL    int64  `json:"ttl"`
		Length int64  `json:"length"`
	}

	entries := make([]keyInfo, 0, len(keys))

	if len(keys) > 0 {
		pipe := client.Pipeline()

		for _, key := range keys {
			pipe.Type(ctx, key)
			pipe.TTL(ctx, key)
		}

		results, _ := pipe.Exec(ctx)

		for index, key := range keys {
			entry := keyInfo{Key: key}

			if index*2+1 >= len(results) {
				entries = append(entries, entry)
				continue
			}

			if command, ok := results[index*2].(*redis.StatusCmd); ok {
				entry.Type = command.Val()
			}

			if command, ok := results[index*2+1].(*redis.DurationCmd); ok {
				entry.TTL = int64(command.Val().Seconds())
			}

			entries = append(entries, entry)
		}

		// second pass adds the size of every key
		type lengthCommand struct {
			index   int
			command redis.Cmder
		}

		lengthPipe := client.Pipeline()
		lengthCmds := make([]lengthCommand, 0, len(entries))

		for index, entry := range entries {
			var command redis.Cmder

			switch entry.Type {
			case "string":
				command = lengthPipe.StrLen(ctx, entry.Key)
			case "hash":
				command = lengthPipe.HLen(ctx, entry.Key)
			case "set":
				command = lengthPipe.SCard(ctx, entry.Key)
			case "zset":
				command = lengthPipe.ZCard(ctx, entry.Key)
			case "list":
				command = lengthPipe.LLen(ctx, entry.Key)
			case "stream":
				command = lengthPipe.XLen(ctx, entry.Key)
			}

			if command != nil {
				lengthCmds = append(lengthCmds, lengthCommand{index: index, command: command})
			}
		}

		if len(lengthCmds) > 0 {
			if _, err := lengthPipe.Exec(ctx); err == nil {
				for _, item := range lengthCmds {
					if intCommand, ok := item.command.(*redis.IntCmd); ok {
						entries[item.index].Length = intCommand.Val()
					}
				}
			}
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"pattern": pattern,
		"keys":    entries,
	})
}

var deniedRedisCommands = map[string]struct{}{
	"FLUSHALL":     {},
	"FLUSHDB":      {},
	"SHUTDOWN":     {},
	"CONFIG":       {},
	"DEBUG":        {},
	"SCRIPT":       {},
	"FUNCTION":     {},
	"EVAL":         {},
	"EVALSHA":      {},
	"EVAL_RO":      {},
	"EVALSHA_RO":   {},
	"FCALL":        {},
	"FCALL_RO":     {},
	"MODULE":       {},
	"MIGRATE":      {},
	"REPLICAOF":    {},
	"SLAVEOF":      {},
	"REPLCONF":     {},
	"SYNC":         {},
	"PSYNC":        {},
	"FAILOVER":     {},
	"MONITOR":      {},
	"CLUSTER":      {},
	"ACL":          {},
	"CLIENT":       {},
	"LATENCY":      {},
	"SWAPDB":       {},
	"RESET":        {},
	"SAVE":         {},
	"BGSAVE":       {},
	"BGREWRITEAOF": {},
	// keys is a blocking full scan, the dedicated endpoint uses scan
	"KEYS": {},
}

func (api *ControlAPI) handleRedisExec(writer http.ResponseWriter, request *http.Request) {
	if api.options.Redis == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{"error": "redis is not enabled"})
		return
	}

	payload := struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	}{}

	if err := readJSON(request, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	command := strings.ToUpper(strings.TrimSpace(payload.Command))

	if command == "" {
		writeJSON(writer, http.StatusBadRequest, map[string]any{"error": "command is required"})
		return
	}

	if _, denied := deniedRedisCommands[command]; denied {
		writeJSON(writer, http.StatusForbidden, map[string]any{"error": "command is not allowed"})
		return
	}

	arguments := make([]interface{}, 0, len(payload.Args)+1)
	arguments = append(arguments, command)

	for _, argument := range payload.Args {
		arguments = append(arguments, argument)
	}

	ctx, cancel := context.WithTimeout(request.Context(), 3*time.Second)
	defer cancel()

	result, err := api.options.Redis.Client.Do(ctx, arguments...).Result()

	if err != nil && !errors.Is(err, redis.Nil) {
		writeJSON(writer, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	body, err := json.Marshal(map[string]any{"result": result})

	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	if len(body) > 2*1024*1024 {
		writeJSON(writer, http.StatusRequestEntityTooLarge, map[string]any{"error": "result is too large"})
		return
	}

	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(body)
}
