package websocket

import (
	"log"
	"os"
	"strconv"
	"sync"
	"time"
	unats "ultragateway/core/nats"
	uredis "ultragateway/core/redis"
	"ultragateway/core/services"
	"ultragateway/core/websocket/connections"
	"ultragateway/core/websocket/internal_events"
	"ultragateway/core/websocket/nats_operations"
	"ultragateway/core/websocket/topics"
	"ultragateway/structs"

	"github.com/lxzan/gws"
	"go.opentelemetry.io/otel"
)

var OTELTracer = otel.Tracer("websocket")
var IsDebug = os.Getenv("DEBUG") == "true"

const (
	// how often the heartbeat scheduler scans the connection table
	defaultHeartbeatTick = 5 * time.Second
	// how often each connection receives a ping
	// must stay well below the client watchdog (30s in the js client)
	defaultPingInterval = 15 * time.Second
	// extra window before a silent connection is considered dead
	defaultPingWait = 30 * time.Second
	// workers used to fan out heartbeat writes
	defaultHeartbeatWorkers = 64
	// buffered queue between the scheduler and the workers
	heartbeatQueueSize = 4096
	// default write deadline per frame
	defaultWriteTimeout = 15 * time.Second
	// default read buffer size per connection
	defaultReadBufferSize = 4 * 1024
	// limit of topics a single connection may subscribe to
	defaultMaxTopicsPerConn = 256
	// presence keys expire after this window, refreshed by the reconciler
	defaultPresenceTTL = 90 * time.Second
	// how often the presence keys are refreshed
	defaultPresenceRefresh = 30 * time.Second
)

type Instance struct {
	Nats           *unats.Instance
	Redis          *uredis.Instance
	Connections    *connections.ConnectionManager
	Upgrader       *gws.Upgrader
	PubSub         *topics.Manager
	NatsOperations map[string]nats_operations.HandlerFunc
	InternalEvents *internal_events.InternalEvents
	Services       *map[string]*services.Service

	PingInterval    time.Duration
	PingWait        time.Duration
	WriteTimeout    time.Duration
	ReadBufferSize  int
	PresenceEnabled bool
	PresenceTTL     time.Duration
	PresenceRefresh time.Duration
}

type NewManagerOptions struct {
	Nats     *unats.Instance
	Redis    *uredis.Instance
	Services *map[string]*services.Service
	Config   *structs.BaseConfig
}

func envSeconds(name string, fallback time.Duration) time.Duration {
	raw := os.Getenv(name)

	if raw == "" {
		return fallback
	}

	seconds, err := strconv.Atoi(raw)

	if err != nil || seconds <= 0 {
		log.Printf("websocket | invalid %s value [%s], using %s", name, raw, fallback)
		return fallback
	}

	return time.Duration(seconds) * time.Second
}

func envInt(name string, fallback int) int {
	raw := os.Getenv(name)

	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)

	if err != nil || value <= 0 {
		log.Printf("websocket | invalid %s value [%s], using %d", name, raw, fallback)
		return fallback
	}

	return value
}

// presenceSetting resolves the opt-in presence flag, env wins over config
func presenceSetting(config *structs.BaseConfig) bool {
	enabled := config != nil && config.Presence.Enabled

	raw, present := os.LookupEnv("PRESENCE_ENABLED")

	if !present || raw == "" {
		return enabled
	}

	parsed, err := strconv.ParseBool(raw)

	if err != nil {
		log.Printf("websocket | invalid PRESENCE_ENABLED value [%s], using config value", raw)
		return enabled
	}

	return parsed
}

func NewManager(options *NewManagerOptions) *Instance {
	instance := &Instance{
		PubSub:          topics.NewManager(envInt("WS_MAX_TOPICS_PER_CONN", defaultMaxTopicsPerConn)),
		Nats:            options.Nats,
		Redis:           options.Redis,
		InternalEvents:  &internal_events.InternalEvents{Handlers: &sync.Map{}},
		Services:        options.Services,
		PingInterval:    envSeconds("WS_PING_INTERVAL", defaultPingInterval),
		PingWait:        envSeconds("WS_PING_WAIT", defaultPingWait),
		WriteTimeout:    envSeconds("WS_WRITE_TIMEOUT", defaultWriteTimeout),
		ReadBufferSize:  envInt("WS_READ_BUFFER_SIZE", defaultReadBufferSize),
		PresenceEnabled: presenceSetting(options.Config),
		PresenceTTL:     envSeconds("PRESENCE_TTL", defaultPresenceTTL),
		PresenceRefresh: envSeconds("PRESENCE_REFRESH_INTERVAL", defaultPresenceRefresh),
	}

	if instance.PresenceEnabled && options.Redis == nil {
		log.Printf("websocket | presence is enabled but redis is not configured, presence stays disabled")
		instance.PresenceEnabled = false
	}

	if instance.PresenceEnabled {
		log.Printf("websocket | presence enabled (ttl %s, refresh %s)", instance.PresenceTTL, instance.PresenceRefresh)
	} else {
		log.Printf("websocket | presence disabled")
	}

	// the ttl has to outlive at least two refresh cycles, otherwise a slow
	// pass would drop every presence key
	if instance.PresenceTTL <= instance.PresenceRefresh {
		log.Printf("websocket | PRESENCE_TTL must be greater than PRESENCE_REFRESH_INTERVAL, using defaults")
		instance.PresenceTTL = defaultPresenceTTL
		instance.PresenceRefresh = defaultPresenceRefresh
	}

	instance.Connections = &connections.ConnectionManager{
		InternalEvents: instance.InternalEvents,
		Config:         options.Config,
	}

	natsOperations := &nats_operations.Instance{
		PubSub:      instance.PubSub,
		Connections: instance.Connections,
	}

	instance.NatsOperations = map[string]nats_operations.HandlerFunc{
		"subscribeToTopic":      natsOperations.TopicSubscribe,
		"unsubscribeToTopic":    natsOperations.TopicUnsubscribe,
		"findClientsByUserId":   natsOperations.FindClientsByUserId,
		"findPresenceByUserIds": natsOperations.FindPresenceByUserIds,
		"sendToUserId":          natsOperations.SendToUserId,
		"sendToTopic":           natsOperations.SendToTopic,
	}

	instance.Upgrader = gws.NewUpgrader(instance, &gws.ServerOption{
		Recovery: gws.Recovery,
		// messages from a single connection are processed in order
		// the handler only parses and forwards to nats, so there is no
		// gain from spawning goroutines per message
		ParallelEnabled: false,
		PermessageDeflate: gws.PermessageDeflate{
			Enabled: false,
		},
	})

	instance.Nats.SetDownstreamHandler(instance.HandleDownstream)
	instance.Nats.SetOperationHandler(instance.HandleOperation)

	instance.StartHeartbeat()
	instance.StartPresenceReconciler()

	return instance
}

// maxAge returns how long a connection may stay silent before being evicted
func (manager *Instance) maxAge() int64 {
	return int64((manager.PingInterval + manager.PingWait).Seconds())
}

// CloseConn closes a connection without blocking the caller
// the close frame goes through the connection write queue and a hard close
// is scheduled as fallback in case the peer is not reachable
func (manager *Instance) CloseConn(conn *gws.Conn, code uint16, reason string) {
	netConn := conn.NetConn()

	if netConn == nil {
		return
	}

	conn.Async(func() {
		_ = conn.SetWriteDeadline(time.Now().Add(manager.WriteTimeout))
		_ = conn.WriteClose(code, []byte(reason))
	})

	time.AfterFunc(manager.WriteTimeout, func() {
		_ = netConn.Close()
	})
}

// CloseAll closes every active connection, used on shutdown
func (manager *Instance) CloseAll(code uint16, reason string) int {
	count := 0

	manager.Connections.Clients.Range(func(_, value any) bool {
		conn, ok := value.(*gws.Conn)

		if !ok {
			return true
		}

		if connCtx, ok := manager.Connections.LoadConnCtx(conn); ok && !connCtx.BeginClose() {
			return true
		}

		manager.CloseConn(conn, code, reason)
		count++

		return true
	})

	return count
}

func (manager *Instance) StartHeartbeat() {
	connCh := make(chan *gws.Conn, heartbeatQueueSize)
	pingPayload := []byte(`{"event":"ping"}`)
	interval := int64(manager.PingInterval.Seconds())

	// each worker owns its broadcasters, the frame is generated once and reused
	for range defaultHeartbeatWorkers {
		go func() {
			frameBroadcaster := gws.NewBroadcaster(gws.OpcodePing, nil)
			jsonBroadcaster := gws.NewBroadcaster(gws.OpcodeText, pingPayload)

			for conn := range connCh {
				_ = frameBroadcaster.Broadcast(conn, nil)
				_ = jsonBroadcaster.Broadcast(conn, nil)
			}
		}()
	}

	go func() {
		ticker := time.NewTicker(defaultHeartbeatTick)
		defer ticker.Stop()

		for range ticker.C {
			now := time.Now().Unix()
			maxAge := manager.maxAge()

			manager.Connections.Clients.Range(func(_, value any) bool {
				conn, ok := value.(*gws.Conn)

				if !ok {
					return true
				}

				connCtx, ok := manager.Connections.LoadConnCtx(conn)

				if !ok {
					return true
				}

				if connCtx.Expired(now, maxAge) {
					// non blocking, safe to call from the scheduler
					if connCtx.BeginClose() {
						manager.CloseConn(conn, 1000, `{ "error": "heartbeat timeout" }`)
					}
					return true
				}

				if !connCtx.PingDue(now, interval) {
					return true
				}

				connCtx.MarkPing(now)

				select {
				case connCh <- conn:
				default:
					// queue is full, retry on the next tick
					connCtx.MarkPing(now - interval)
				}

				return true
			})
		}
	}()
}
