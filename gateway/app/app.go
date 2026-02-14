package app

import (
	"encoding/base64"
	"fmt"
	"log"
	"maps"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"ultragateway/config"
	baseSrv "ultragateway/core/http"
	"ultragateway/core/ipc"
	"ultragateway/core/jsvm"
	"ultragateway/core/nats"
	unats "ultragateway/core/nats"
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
	HttpPathsRefs    *sync.Map
	JSVM             *jsvm.JSVM
}

var Pwd string

func Start() {
	if len(os.Args) > 1 {
		Pwd = os.Args[1]
	} else {
		Pwd, _ = os.Getwd()
	}

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

	// if no bootloader specified, search in the pwd for built-in linebridge
	// usually should be on node_modules
	if appCfg.Services.Bootloader == "" {
		lbModulePath := filepath.Join(Pwd, "node_modules", "linebridge")
		lbBootloaderBinPath := filepath.Join(lbModulePath, "bootloader/bin")

		// check if exist bin
		if _, err := os.Stat(lbBootloaderBinPath); os.IsNotExist(err) {
			log.Fatal("Linebridge bootloader not found. Check if 'linebridge' module is installed or use a custom bootloader on `config.services.bootloader=`")
		}

		appCfg.Services.Bootloader = lbBootloaderBinPath
	}

	natsServer := StartEmbeddedNats()

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
		Services:      make(map[string]*services.Service),
		HttpPathsRefs: &sync.Map{},
	}

	// if INFISICAL env injection in available, go ahead
	if os.Getenv("INFISICAL_CLIENT_ID") != "" {
		log.Printf("Loading Infisical environment variables")
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

	// initialize NATS
	appData.Nats = nats.NewManager(&nats.NewManagerOptions{})

	if err := appData.Nats.Start(); err != nil {
		log.Fatalf("Failed to initialize NATS handler\n %v", err)
	}

	// initialize Websocket
	appData.WebsocketManager = websocket.NewManager(&websocket.NewManagerOptions{
		Nats:     appData.Nats,
		Services: &appData.Services,
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

	// initialize all base microservices
	for _, service := range scannedServices {
		serviceInst := services.NewService(
			&services.NewServiceOptions{
				Id:                service["id"],
				MainPath:          service["path"],
				Cwd:               service["cwd"],
				Env:               servicesEnv,
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
		HttpPathsRefs:    appData.HttpPathsRefs,
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
		log.Println("Stopping embedded NATS server")
		natsServer.Shutdown()

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
