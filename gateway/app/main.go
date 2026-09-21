package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"maps"
	"os"
	"os/signal"
	"path"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"ultragateway/config"
	"ultragateway/control_api"
	control "ultragateway/control_api"
	baseSrv "ultragateway/core/http"
	"ultragateway/core/ipc"
	"ultragateway/core/jsvm"
	"ultragateway/core/nats"
	unats "ultragateway/core/nats"
	uredis "ultragateway/core/redis"
	"ultragateway/core/services"
	"ultragateway/core/websocket"
	"ultragateway/requests"
	"ultragateway/structs"
	"ultragateway/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/nats-io/nats-server/v2/server"
	natsServer "github.com/nats-io/nats-server/v2/server"
)

var IsDebug = os.Getenv("DEBUG") == "true"

var (
	ProductName   = "lb-ultrawg"
	Version       = "exp"
	BuildTime     = "unknown"
	VersionString = fmt.Sprintf("%s-%s", Version, strings.Join(strings.Split(BuildTime, "-"), ""))
)

type App struct {
	ProductName      string
	Version          string
	StartTime        time.Time
	SysInfo          map[string]any
	ProjectJSON      *structs.PackageJSON
	Config           *structs.BaseConfig
	Services         map[string]*services.Service
	InfisicalEnv     map[string]string
	SocketListener   *ipc.Instance
	Nats             *unats.Instance
	Redis            *uredis.Instance
	WebsocketManager *websocket.Instance
	HttpPathsRefs    *sync.Map
	JSVM             *jsvm.JSVM
	ControlAPI       *control.ControlAPI
	OTEL             *OTEL
	IsDebug          bool
}

var Pwd string = utils.Pwd()

func getGracefulTimeout() time.Duration {
	if val := os.Getenv("GRACEFUL_SHUTDOWN_TIMEOUT"); val != "" {
		if secs, err := strconv.Atoi(val); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return 30 * time.Second
}

func gracefulShutdown(appData *App, natsSrv *natsServer.Server) {
	shutdownTimeout := getGracefulTimeout()
	waitForever := os.Getenv("AUTO_SHUTDOWN_WHEN_IDLE") == "true"

	if waitForever {
		log.Printf("Graceful shutdown initiated, waiting indefinitely for idle")
	} else {
		log.Printf("Graceful shutdown initiated, timeout: %v", shutdownTimeout)
	}

	requests.IsShuttingDown = true

	// step 1: wait for active websocket connections to drain
	if appData.WebsocketManager != nil && appData.WebsocketManager.Connections != nil {
		drainStart := time.Now()

		for {
			connCount := 0
			appData.WebsocketManager.Connections.Clients.Range(func(key, value any) bool {
				connCount++
				return true
			})

			if connCount == 0 {
				log.Println("All websocket connections drained")
				break
			}

			log.Printf("Draining websocket connections... (%d remaining)", connCount)

			if !waitForever && time.Since(drainStart) >= shutdownTimeout {
				log.Println("Drain timeout reached, forcing shutdown")
				break
			}

			time.Sleep(2 * time.Second)
		}
	}

	// step 2: stop IPC socket (no new service registrations)
	log.Println("Stopping IPC socket")
	if appData.SocketListener != nil {
		appData.SocketListener.Stop()
	}

	// step 3: stop all services gracefully
	log.Println("Stopping all services...")
	for _, service := range appData.Services {
		service.Stop()
	}

	// step 4: shutdown NATS (only if embedded, not external)
	if natsSrv != nil {
		log.Println("Stopping embedded NATS server")
		natsSrv.Shutdown()
	}

	// step 5: cleanup OTEL
	if appData.OTEL != nil {
		if appData.OTEL.TraceProvider != nil {
			log.Println("Shutting down Trace OTEL provider")
			appData.OTEL.TraceProvider.Shutdown(context.Background())
		}
		if appData.OTEL.LogProvider != nil {
			log.Println("Shutting down Logger OTEL provider")
			appData.OTEL.LogProvider.Shutdown(context.Background())
		}
	}

	log.Println("Graceful shutdown complete")
}

func Start() {
	os.Setenv("ROOT_PATH", Pwd)
	log.Printf("[%s v%s]", ProductName, VersionString)
	log.Println(Pwd)

	configMng := &config.ConfigManager{
		Pwd: Pwd,
	}

	appCfg, err := configMng.ReadConfig()

	if err != nil {
		log.Fatalln("Failed to load config.json", err)
	}

	// if no mode specified, default to dev
	if appCfg.Mode == "" {
		appCfg.Mode = "dev"
	}

	// if no bootloader specified, search in the project installed dependencies
	if appCfg.Services.Bootloader == "" {
		bootloaderBinPath, err := utils.ScanBootloaderLocation()

		if err != nil {
			log.Fatal("Linebridge bootloader not found. Check if 'linebridge' module is installed or use a custom bootloader on `config.services.bootloader=`")
		}

		log.Printf("Scanned Bootloader binary: %v\n", bootloaderBinPath)

		appCfg.Services.Bootloader = bootloaderBinPath
	}

	// use external NATS if NATS_URL is set, otherwise start embedded
	natsURL := os.Getenv("NATS_URL")
	var natsEmbedded *natsServer.Server

	if natsURL == "" {
		natsEmbedded = StartEmbeddedNats()
	} else {
		log.Printf("Using external NATS at %s", natsURL)
	}

	// read the current project package
	projectPkgJson, err := configMng.ReadPackageJson()

	if err != nil {
		log.Printf(`Warning: Failed to load project package.json: %v`, err)
	}

	// Scan services on CWD
	scannedServices := utils.ScanServices(Pwd)

	if len(scannedServices) == 0 {
		log.Fatal("No services found")
	}

	// create the base singleton app instance
	appData := &App{
		ProductName: ProductName,
		Version:     VersionString,
		ProjectJSON: projectPkgJson,
		StartTime:   time.Now(),
		Config:      appCfg,
		SysInfo: map[string]any{
			"os":         runtime.GOOS,
			"arch":       runtime.GOARCH,
			"go_version": runtime.Version(),
			"cpu_cores":  runtime.NumCPU(),
		},
		Services:      make(map[string]*services.Service),
		HttpPathsRefs: &sync.Map{},
		IsDebug:       IsDebug,
	}

	go appData.StartReadline()

	// if INFISICAL env injection in available, go ahead
	if os.Getenv("INFISICAL_CLIENT_ID") != "" {
		LoadInfisicalEnvs(appData)

		// if JWT_SECRET is defined on the loaded infiscal envs, override to current config JWTSecretKey
		if appData.InfisicalEnv["JWT_SECRET"] != "" {
			appData.Config.JWT.Secret = appData.InfisicalEnv["JWT_SECRET"]
		}

		// Automatically decode base64 encoded ECDSA keys, if they exist
		if appData.InfisicalEnv["ECDSA_PRIVATE_KEY_B64"] != "" && appData.InfisicalEnv["ECDSA_PUBLIC_KEY_B64"] != "" {
			if val, err := base64.StdEncoding.DecodeString(appData.InfisicalEnv["ECDSA_PRIVATE_KEY_B64"]); err == nil {
				appData.InfisicalEnv["ECDSA_PRIVATE_KEY"] = string(val)
				appData.Config.JWT.PrivateKey = appData.InfisicalEnv["ECDSA_PRIVATE_KEY"]
				appData.Config.JWT.ECDSAPrivateKey, _ = jwt.ParseECPrivateKeyFromPEM(val)
			}
			if val, err := base64.StdEncoding.DecodeString(appData.InfisicalEnv["ECDSA_PUBLIC_KEY_B64"]); err == nil {
				appData.InfisicalEnv["ECDSA_PUBLIC_KEY"] = string(val)
				appData.Config.JWT.PublicKey = appData.InfisicalEnv["ECDSA_PUBLIC_KEY"]
				appData.Config.JWT.ECDSAPublicKey, _ = jwt.ParseECPublicKeyFromPEM(val)
			}
		}
	}

	// Initialize Control API
	if appData.Config.ControlAPI.Enabled == true {
		appData.ControlAPI = control_api.NewControlAPI(&control.NewControlAPIOptions{
			Config: appData.Config,
		})
	}

	if appData.Config.OTEL.Enabled == true {
		appData.InitOTEL()
	}

	// initialize NATS client (connects to external or embedded)
	appData.Nats = nats.NewManager(&nats.NewManagerOptions{
		NatsURL: natsURL,
	})

	if err := appData.Nats.Start(); err != nil {
		log.Fatalf("Failed to initialize NATS handler\n %v", err)
	}

	// initialize Redis client if enabled
	appData.Redis = uredis.Connect(&appCfg.Redis)

	if appData.Redis != nil {
		log.Println("Redis client initialized")
	}

	// initialize Websocket
	appData.WebsocketManager = websocket.NewManager(&websocket.NewManagerOptions{
		Nats:     appData.Nats,
		Redis:    appData.Redis,
		Services: &appData.Services,
		Config:   appCfg,
	})

	// initialize the Unix socket listener for inter-service communication
	ipcEvents := &IpcEvents{
		AppData: appData,
	}

	if socketListener, err := ipc.New(&ipc.NewListenerOptions{
		Config:            *appData.Config,
		OnServiceRegister: ipcEvents.OnRegisterServiceEvent,
	}); err != nil {
		log.Fatalf("Failed to initialize IPC socket listener\n %v", err)
	} else {
		appData.SocketListener = socketListener
	}

	// create a env for services
	servicesEnv := map[string]string{}

	// parse & copy the current environ
	for _, env := range os.Environ() {
		parts := strings.Split(env, "=")

		if len(parts) == 2 {
			servicesEnv[parts[0]] = parts[1]
		}
	}

	// if infiscal env is available, copy them
	if appData.InfisicalEnv != nil {
		maps.Copy(servicesEnv, appData.InfisicalEnv)
	}

	// create a JSVM instance
	appData.JSVM = jsvm.Create(&jsvm.JSVM{
		WebsocketManager: appData.WebsocketManager,
	})

	// load plugins scripts
	for _, script := range appData.Config.Scripts {
		// resolve path
		script.Path = path.Join(Pwd, script.Path)

		log.Printf("Loading script > %s", script.Path)

		// run script
		if _, err := appData.JSVM.RunScript(script.Path); err != nil {
			log.Printf("Failed to run script %s: %v", script.Path, err)

			if script.CrashIfFailed {
				log.Fatal("Required script failed")
			}

			continue
		}
	}

	// parse START_ONLY_SERVICES to filter which services to start
	onlyServices := map[string]bool{}
	if raw := os.Getenv("START_ONLY_SERVICES"); raw != "" {
		for _, s := range strings.Split(raw, ",") {
			onlyServices[strings.TrimSpace(s)] = true
		}
		log.Printf("Filtering services: only starting %v", raw)
	}

	// initialize all base microservices
	for _, service := range scannedServices {
		serviceID := service["id"]

		// skip if we are filtering and this service is not in the list
		if len(onlyServices) > 0 && !onlyServices[serviceID] {
			log.Printf("Skipping service [%s] (not in START_ONLY_SERVICES)", serviceID)
			continue
		}

		serviceInst := services.NewService(
			&services.NewServiceOptions{
				Id:                serviceID,
				MainPath:          service["path"],
				Cwd:               service["cwd"],
				Env:               servicesEnv,
				EnableWatcher:     appCfg.Mode == "dev",
				BootloaderPath:    appCfg.Services.Bootloader,
				GatewaySocketPath: appCfg.IPC.Path,
			},
		)

		appData.Services[serviceID] = serviceInst
		appData.Services[serviceID].Start()
	}

	reqHandler := &requests.Requests{
		ProductName:      appData.ProductName,
		ProductVersion:   appData.Version,
		StartTime:        appData.StartTime,
		SysInfo:          appData.SysInfo,
		ProjectJSON:      appData.ProjectJSON,
		Config:           appCfg,
		WebsocketManager: appData.WebsocketManager,
		Services:         appData.Services,
		HttpPathsRefs:    appData.HttpPathsRefs,
	}

	serversWaitGroup := &sync.WaitGroup{}

	// create the default http server
	serversWaitGroup.Add(1)

	// define base srv options
	baseSrvOptions := baseSrv.CreateEngineOptions{
		WaitGroup:    serversWaitGroup,
		Requests:     reqHandler,
		ListenPort:   appCfg.Http.Port,
		CustomRoutes: appCfg.Routes,
	}

	go baseSrv.CreateEngine(baseSrvOptions)

	// signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigChan
		log.Printf("Received signal: %v, starting graceful shutdown", sig)
		gracefulShutdown(appData, natsEmbedded)
		os.Exit(0)
	}()

	serversWaitGroup.Wait()
	log.Println("All servers finished, executing internal cleanup")
}

func StartEmbeddedNats() *natsServer.Server {
	opts := &natsServer.Options{
		Host:       "0.0.0.0",
		Port:       4222,
		Debug:      IsDebug,
		NoSigs:     true,
		MaxPayload: 1024 * 1024,
		JetStream:  true,
		StoreDir:   "./nats-data",
	}

	ns, err := server.NewServer(opts)

	if err != nil {
		log.Fatalf("Failed to create embedded NATS server: %v", err)
	}

	log.Println("Starting embedded NATS server")

	go ns.Start()

	if !ns.ReadyForConnections(5 * time.Second) {
		log.Fatal("Failed to start embedded NATS server. Server ready timeout")
	}

	log.Println("Embedded NATS server started")

	return ns
}
