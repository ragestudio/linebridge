package app

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"
	"ultragateway/config"
	baseSrv "ultragateway/core/http"
	"ultragateway/core/ipc"
	"ultragateway/core/nats"
	unats "ultragateway/core/nats"
	"ultragateway/core/services"
	"ultragateway/core/websocket"
	"ultragateway/requests"
	"ultragateway/structs"
	"ultragateway/utils"
)

var IsDebug = os.Getenv("DEBUG") == "true"

var (
	ProductName   = "lb-ultrawg"
	Version       = "exp"
	BuildTime     = "unknown"
	VersionString = fmt.Sprintf("%s-%s", Version, strings.Join(strings.Split(BuildTime, "-"), ""))
)

type AppData struct {
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
	WebsocketManager *websocket.Instance
}

func Start() {
	log.Printf("[%s v%s]", ProductName, VersionString)

	configMng := &config.ConfigManager{}

	appCfg, err := configMng.ReadConfig()

	if err != nil {
		log.Fatalln("Failed to load config.json", err)
	}

	if appCfg.Mode == "" {
		appCfg.Mode = "dev"
	}

	projectPkgJson, err := configMng.ReadPackageJson()

	if err != nil {
		log.Printf(`Warning: Failed to load project package.json: %v`, err)
	}

	// Scan services on CWD
	scannedServices := utils.ScanServices()

	if len(scannedServices) == 0 {
		log.Fatal("No services found")
	}

	// create the base singleton app instance
	appData := &AppData{
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
		Services: make(map[string]*services.Service),
	}

	// if INFISICAL env injection in available, go ahead
	if os.Getenv("INFISICAL_CLIENT_ID") != "" {
		log.Printf("Loading Infisical environment variables")
		LoadInfisicalEnvs(appData)

		// if JWT_SECRET is defined on the loaded infiscal envs, override to current config JWTSecretKey
		if appData.InfisicalEnv["JWT_SECRET"] != "" {
			appData.Config.JWT.Secret = appData.InfisicalEnv["JWT_SECRET"]
		}
	}

	// initialize NATS
	appData.Nats = nats.NewManager(&nats.NewManagerOptions{})

	if err := appData.Nats.Start(); err != nil {
		log.Fatalf("Failed to initialize NATS handler\n %v", err)
	}

	// initialize Websocket
	appData.WebsocketManager = websocket.NewManager(&websocket.NewManagerOptions{
		Nats: appData.Nats,
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

	// initialize all base microservices
	for _, service := range scannedServices {
		serviceInst := services.NewService(
			&services.NewServiceOptions{
				Id:                service["id"],
				MainPath:          service["path"],
				Cwd:               service["cwd"],
				Env:               appData.InfisicalEnv,
				EnableWatcher:     appCfg.Mode == "dev",
				BootloaderPath:    appCfg.Services.Bootloader,
				GatewaySocketPath: appCfg.IPC.Path,
			},
		)

		appData.Services[service["id"]] = serviceInst
		appData.Services[service["id"]].Start()
	}

	requests := &requests.Requests{
		ProductName:      appData.ProductName,
		ProductVersion:   appData.Version,
		StartTime:        appData.StartTime,
		SysInfo:          appData.SysInfo,
		ProjectJSON:      appData.ProjectJSON,
		Config:           appCfg,
		WebsocketManager: appData.WebsocketManager,
		Services:         appData.Services,
	}
	serversWaitGroup := &sync.WaitGroup{}

	// create the default http server
	serversWaitGroup.Add(1)

	go baseSrv.CreateEngine(baseSrv.CreateEngineOptions{
		WaitGroup:  serversWaitGroup,
		Requests:   requests,
		ListenPort: appCfg.Http.Port,
	})

	// Setup cleanup on exit
	defer func() {
		log.Println("Stoping IPC socket")
		appData.SocketListener.Stop()

		log.Printf("Stopping all services...")
		for _, service := range appData.Services {
			service.Stop()
		}

		log.Printf("All done!")
	}()

	serversWaitGroup.Wait()
	log.Println("All servers finished, executing internal cleanup")
}
