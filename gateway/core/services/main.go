package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/fsnotify/fsnotify"
)

var IsDebug bool = os.Getenv("DEBUG") == "true"

type ServiceInterface interface {
	Start() error
	Stop() error
	Restart() error
	SetListenSocket(string) error
	GetListenSocket() string
	GetSocketClient() *client.Client
}

type Service struct {
	ID             string
	MainPath       string
	Cwd            string
	Cmd            *exec.Cmd
	Env            map[string]string
	Running        bool
	Watcher        *fsnotify.Watcher
	ListenSocket   string
	SocketClient   *client.Client
	BootloaderPath string

	// internal state management
	Mutex           sync.Mutex
	StopCh          chan struct{}
	RestartCh       chan struct{}
	RestartTimer    *time.Timer
	LastRestart     time.Time
	CrashCount      int
	IntentionalStop bool
	KilledProcess   *os.Process
	LastCrash       time.Time

	ctx    context.Context
	cancel context.CancelFunc
}

type NewServiceOptions struct {
	Id                string // required
	MainPath          string // required
	Cwd               string
	Env               map[string]string
	EnableWatcher     bool
	GatewaySocketPath string
	BootloaderPath    string
}

var DebounceTime = 500 * time.Millisecond
var MaxBackoffTime = 30 * time.Second
var MinBackoffTime = 1 * time.Second

func NewService(options *NewServiceOptions) *Service {
	if options.Id == "" {
		log.Printf("Service ID cannot be empty")
		return nil
	}

	if options.MainPath == "" {
		log.Printf("Service main path cannot be empty")
		return nil
	}

	// if cwd not defined, use the dir of the main path
	if options.Cwd == "" {
		options.Cwd = filepath.Dir(options.MainPath)
	}

	if options.Env == nil {
		options.Env = make(map[string]string)
	}

	// set some linebridge envs to enable gateway mode
	options.Env["LB_SOCKET_MODE"] = "true"

	if options.GatewaySocketPath != "" {
		options.Env["LB_GATEWAY_SOCKET"] = options.GatewaySocketPath
	}

	// create context for lifecycle management
	ctx, cancel := context.WithCancel(context.Background())

	// create the service obj
	serviceObj := &Service{
		ID:              options.Id,
		MainPath:        options.MainPath,
		BootloaderPath:  options.BootloaderPath,
		Cwd:             options.Cwd,
		Env:             options.Env,
		Running:         false,
		StopCh:          make(chan struct{}),
		RestartCh:       make(chan struct{}, 10), // buffered to avoid blocking
		ctx:             ctx,
		cancel:          cancel,
		IntentionalStop: false,
		KilledProcess:   nil,
	}

	if options.EnableWatcher {
		err := AttachWatcherToService(serviceObj)

		if err != nil {
			log.Printf("Failed to create watcher for service [%s]: %v", serviceObj.ID, err)
		}
	}

	// start restart management goroutine
	go serviceObj.manageRestarts()

	log.Printf("Service [%s] created", serviceObj.ID)

	return serviceObj
}

func (service *Service) requestRestart() {
	select {
	case service.RestartCh <- struct{}{}:
		// restart request sent
	default:
		// channel full, drop the request to avoid blocking
	}
}

func (service *Service) manageRestarts() {
	for {
		select {
		case <-service.ctx.Done():
			return
		case <-service.RestartCh:
			service.debouncedRestart()
		}
	}
}

func (service *Service) debouncedRestart() {
	service.Mutex.Lock()

	// cancel any pending timer
	if service.RestartTimer != nil {
		service.RestartTimer.Stop()
	}

	// check if enough time has passed since last restart
	elapsed := time.Since(service.LastRestart)

	if elapsed < DebounceTime {
		// schedule restart after debounce period
		service.RestartTimer = time.AfterFunc(DebounceTime-elapsed, func() {
			service.Mutex.Lock()
			service.performRestart()
			service.Mutex.Unlock()
		})
		service.Mutex.Unlock()
		return
	}

	service.performRestart()
	service.Mutex.Unlock()
}

func (service *Service) performRestart() {
	service.LastRestart = time.Now()

	log.Printf("Service [%s] performing restart", service.ID)

	if service.Running {
		service.stopProcess()
	}

	// reset crash counter for manual/planned restarts
	service.CrashCount = 0
	service.IntentionalStop = false

	service.startProcessLocked()
}

func (service *Service) startProcessLocked() error {
	log.Printf("Starting service [%s] %s", service.ID, service.MainPath)

	cmd := exec.Command(service.BootloaderPath, service.MainPath)
	cmd.Env = make([]string, 0, len(service.Env))
	cmd.Dir = service.Cwd

	// inject the env variables to cmd
	for key, value := range service.Env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	// pipe stdout and stderr to the current process
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Start()
	if err != nil {
		log.Printf("Failed to start service [%s]: %v", service.ID, err)
		return err
	}

	service.Cmd = cmd
	service.Running = true
	service.IntentionalStop = false

	// monitor process exit in goroutine
	go service.monitorProcess(cmd)

	return nil
}

func (service *Service) monitorProcess(cmd *exec.Cmd) {
	err := cmd.Wait()

	service.Mutex.Lock()
	service.Running = false

	// check if this process was intentionally killed
	wasIntentionallyKilled := false

	if service.KilledProcess == cmd.Process {
		wasIntentionallyKilled = true
		service.KilledProcess = nil
	}

	if err != nil {
		log.Printf("Service [%s] exited with error: %v", service.ID, err)

		// handle auto-restart on crash only if not intentionally stopped
		if IsDebug && !service.IntentionalStop && !wasIntentionallyKilled {
			service.handleCrashRestart()
		}
	} else {
		log.Printf("Service [%s] exited normally", service.ID)
		// reset crash counter on normal exit
		service.CrashCount = 0
	}

	// reset intentionalStop flag after handling exit
	service.IntentionalStop = false
	service.Mutex.Unlock()
}

func (service *Service) handleCrashRestart() {
	now := time.Now()

	// calculate backoff based on crash count
	var backoff time.Duration
	if service.CrashCount == 0 {
		backoff = MinBackoffTime
	} else {
		// exponential backoff with cap
		backoff = MinBackoffTime * time.Duration(1<<uint(service.CrashCount))
		if backoff > MaxBackoffTime {
			backoff = MaxBackoffTime
		}
	}

	// check if enough time has passed since last crash
	if service.LastCrash.IsZero() || now.Sub(service.LastCrash) >= backoff {
		service.CrashCount++
		service.LastCrash = now

		log.Printf("Service [%s] will restart after %v (crash count: %d)",
			service.ID, backoff, service.CrashCount)

		// schedule restart with backoff
		time.AfterFunc(backoff, func() {
			service.Mutex.Lock()
			if !service.Running {
				service.startProcessLocked()
			}
			service.Mutex.Unlock()
		})
	} else {
		// crashes happening too fast, wait for full backoff
		remaining := backoff - now.Sub(service.LastCrash)
		log.Printf("Service [%s] crashes too fast, waiting %v before restart",
			service.ID, remaining)

		time.AfterFunc(remaining, func() {
			service.Mutex.Lock()
			if !service.Running {
				service.CrashCount++
				service.LastCrash = time.Now()
				service.startProcessLocked()
			}
			service.Mutex.Unlock()
		})
	}
}

func (service *Service) stopProcess() {
	if service.Cmd != nil && service.Cmd.Process != nil {
		log.Printf("Stopping service [%s] process", service.ID)

		service.KilledProcess = service.Cmd.Process
		service.Cmd.Process.Kill()

		// wait a bit for process to exit
		time.Sleep(100 * time.Millisecond)
	}
}

func (service *Service) Start() error {
	service.Mutex.Lock()
	defer service.Mutex.Unlock()

	if service.Running {
		log.Printf("Service [%s] already running", service.ID)
		return nil
	}

	return service.startProcessLocked()
}

func (service *Service) Stop() error {
	log.Printf("Stopping service [%s]", service.ID)

	// cancel context to stop all goroutines
	service.cancel()

	service.Mutex.Lock()
	defer service.Mutex.Unlock()
	service.IntentionalStop = true

	// stop any pending restart timer
	if service.RestartTimer != nil {
		service.RestartTimer.Stop()
	}

	// close watcher if exists
	if service.Watcher != nil {
		service.Watcher.Close()
	}

	// stop the process
	service.stopProcess()

	// reset state
	service.Running = false
	service.CrashCount = 0

	close(service.StopCh)

	return nil
}

func (service *Service) Restart() error {
	log.Printf("Manual restart requested for service [%s]", service.ID)

	service.Mutex.Lock()
	service.CrashCount = 0 // reset crash counter for manual restart
	service.IntentionalStop = false
	service.Mutex.Unlock()

	service.requestRestart()
	return nil
}
