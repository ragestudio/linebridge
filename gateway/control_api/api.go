package control_api

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"ultragateway/core/logs"
	"ultragateway/core/nats"
	"ultragateway/core/redis"
	"ultragateway/core/services"
	"ultragateway/core/websocket"
	"ultragateway/structs"

	"github.com/lxzan/gws"
)

const DefaultListen = "127.0.0.1:9999"

//go:embed ui
var embeddedUI embed.FS

type NewControlAPIOptions struct {
	Config        *structs.BaseConfig
	Services      *map[string]*services.Service
	Websocket     *websocket.Instance
	Redis         *redis.Instance
	Nats          *nats.Instance
	Logs          *logs.Hub
	ProductName   string
	Version       string
	StartTime     time.Time
	SysInfo       map[string]any
	HttpPathsRefs *sync.Map
}

// ControlAPI is the development control plane, it exposes the state of the
// gateway and its services over http and a websocket stream
type ControlAPI struct {
	options  NewControlAPIOptions
	server   *http.Server
	listener net.Listener
	mux      *http.ServeMux
	addr     string
	ui       fs.FS
	upgrader *gws.Upgrader
	sampler  *procSampler
}

func NewControlAPI(options *NewControlAPIOptions) *ControlAPI {
	instance := &ControlAPI{
		options: *options,
		addr:    resolveListenAddress(options.Config),
		sampler: newProcSampler(),
	}

	instance.ui = resolveUIFS()
	instance.mux = instance.buildRouter()
	instance.upgrader = gws.NewUpgrader(&wsHandler{api: instance}, &gws.ServerOption{
		Recovery: gws.Recovery,
	})

	listener, err := net.Listen("tcp", instance.addr)

	if err != nil {
		log.Printf("Control API failed to listen on [%s]: %v", instance.addr, err)
		return instance
	}

	instance.listener = listener
	instance.server = &http.Server{
		Handler:           instance.handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := instance.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("Control API stopped: %v", err)
		}
	}()

	log.Printf("Control API listening on http://%s/ui", instance.addr)

	if !isLoopbackListen(instance.addr) {
		log.Printf("Control API WARNING: listening on a non loopback address, it can stop services and run redis commands")
	}

	return instance
}

func resolveListenAddress(config *structs.BaseConfig) string {
	if address := os.Getenv("CONTROL_API_LISTEN"); address != "" {
		return address
	}

	if config != nil && config.ControlAPI.Listen != "" {
		return config.ControlAPI.Listen
	}

	return DefaultListen
}

// isLoopbackListen reports whether the control api is bound to the local host
func isLoopbackListen(address string) bool {
	host, _, err := net.SplitHostPort(address)

	if err != nil || host == "" {
		return false
	}

	if host == "localhost" {
		return true
	}

	ip := net.ParseIP(host)

	return ip != nil && ip.IsLoopback()
}

func resolveUIFS() fs.FS {
	if directory := os.Getenv("CONTROL_API_UI_DIR"); directory != "" {
		if info, err := os.Stat(directory); err == nil && info.IsDir() {
			return os.DirFS(directory)
		}
	}

	sub, err := fs.Sub(embeddedUI, "ui")

	if err != nil {
		return nil
	}

	return sub
}

func (api *ControlAPI) Stop() {
	if api.server == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_ = api.server.Shutdown(ctx)
}

// Handler returns the http handler, used by the tests
func (api *ControlAPI) Handler() http.Handler {
	return api.handler()
}

func (api *ControlAPI) handler() http.Handler {
	// the control plane is local only, keep request bodies small
	return http.MaxBytesHandler(withCORS(api.mux), 1<<20)
}

func (api *ControlAPI) buildRouter() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", api.handleHealth)
	mux.HandleFunc("GET /api/config", api.handleConfig)
	mux.HandleFunc("GET /api/system", api.handleSystem)

	mux.HandleFunc("GET /api/services", api.handleServices)
	mux.HandleFunc("GET /api/services/{id}", api.handleServiceDetail)
	mux.HandleFunc("POST /api/services/{id}/start", api.handleServiceStart)
	mux.HandleFunc("POST /api/services/{id}/stop", api.handleServiceStop)
	mux.HandleFunc("POST /api/services/{id}/restart", api.handleServiceRestart)

	mux.HandleFunc("GET /api/logs", api.handleLogs)
	mux.HandleFunc("DELETE /api/logs", api.handleLogsClear)

	mux.HandleFunc("GET /api/websocket", api.handleWebsocket)
	mux.HandleFunc("GET /api/websocket/{id}", api.handleWebsocketConnection)
	mux.HandleFunc("POST /api/websocket/{id}/close", api.handleWebsocketClose)

	mux.HandleFunc("GET /api/presence", api.handlePresenceList)
	mux.HandleFunc("GET /api/presence/{id}", api.handlePresence)

	mux.HandleFunc("GET /api/redis/info", api.handleRedisInfo)
	mux.HandleFunc("GET /api/redis/keys", api.handleRedisKeys)
	mux.HandleFunc("POST /api/redis/exec", api.handleRedisExec)

	mux.HandleFunc("GET /api/ws", api.handleStream)

	mux.HandleFunc("/ui/", api.handleUI)
	mux.HandleFunc("GET /ui", func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, "/ui/", http.StatusMovedPermanently)
	})
	mux.HandleFunc("/api/", api.notFound)
	mux.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/" {
			http.Redirect(writer, request, "/ui/", http.StatusFound)
			return
		}

		api.notFound(writer, request)
	})

	return mux
}

// localOrigin only accepts origins that point to the local machine
func localOrigin(origin string) bool {
	parsed, err := url.Parse(origin)

	if err != nil || parsed.Host == "" {
		return false
	}

	switch parsed.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}

	return false
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Add("Vary", "Origin")

		// never answer cross-origin requests from non local pages, the
		// control api can execute redis commands and stop services
		origin := request.Header.Get("Origin")

		if origin != "" && localOrigin(origin) {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		}

		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
	})
}

func (api *ControlAPI) notFound(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusNotFound, map[string]any{
		"error": "not found",
		"path":  request.URL.Path,
	})
}

func (api *ControlAPI) handleUI(writer http.ResponseWriter, request *http.Request) {
	if api.ui == nil {
		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		writer.WriteHeader(http.StatusServiceUnavailable)
		_, _ = writer.Write([]byte("control ui is not embedded"))
		return
	}

	path := strings.TrimPrefix(request.URL.Path, "/ui")
	path = strings.TrimPrefix(path, "/")

	if path == "" {
		path = "index.html"
	}

	if data, err := fs.ReadFile(api.ui, path); err == nil {
		api.serveUIFile(writer, path, data)
		return
	}

	// single page application fallback
	data, err := fs.ReadFile(api.ui, "index.html")

	if err != nil {
		http.NotFound(writer, request)
		return
	}

	api.serveUIFile(writer, "index.html", data)
}

func (api *ControlAPI) serveUIFile(writer http.ResponseWriter, name string, data []byte) {
	contentType := mime.TypeByExtension(filepath.Ext(name))

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	writer.Header().Set("Content-Type", contentType)
	writer.Header().Set("Cache-Control", "no-store")
	_, _ = writer.Write(data)
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)

	if value == nil {
		return
	}

	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}

func readJSON(request *http.Request, target any) error {
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()

	return decoder.Decode(target)
}
