package services

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"ultragateway/core/logs"
	"ultragateway/utils"

	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/fsnotify/fsnotify"
)

type ServiceInterface interface {
	Start() error
	Stop() error
	Restart() error
	SetListenSocket(string) error
	GetListenSocket() string
	GetSocketClient() *client.Client
}

// shuttingDown blocks every restart path once the gateway starts draining
var shuttingDown atomic.Bool

func BeginShutdown() {
	shuttingDown.Store(true)
}

func IsShuttingDown() bool {
	return shuttingDown.Load()
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
	Logs           *logs.Hub

	mutex            sync.Mutex
	ctx              context.Context
	cancel           context.CancelFunc
	restartRequested bool
	processDone      chan struct{}
	skipNextRestart  bool
	watcherEnabled   bool
	startedAt        time.Time
	starts           int
	registration     Registration
	registered       bool
}

type NewServiceOptions struct {
	Id                string
	MainPath          string
	Cwd               string
	Env               map[string]string
	EnableWatcher     bool
	GatewaySocketPath string
	BootloaderPath    string
	Logs              *logs.Hub
}

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
		ID:               options.Id,
		MainPath:         options.MainPath,
		BootloaderPath:   options.BootloaderPath,
		Cwd:              options.Cwd,
		Env:              options.Env,
		Running:          false,
		ctx:              ctx,
		cancel:           cancel,
		processDone:      make(chan struct{}, 1),
		restartRequested: false,
		skipNextRestart:  false,
		watcherEnabled:   options.EnableWatcher,
		Logs:             options.Logs,
	}

	if options.EnableWatcher {
		err := attachWatcherToService(serviceObj, ctx)
		if err != nil {
			log.Printf("Failed to create watcher for service [%s]: %v", serviceObj.ID, err)
		}
	}

	log.Printf("Service [%s] created", serviceObj.ID)
	return serviceObj
}

func (s *Service) Start() error {
	if shuttingDown.Load() {
		return fmt.Errorf("gateway is shutting down, service [%s] will not start", s.ID)
	}

	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Running {
		log.Printf("Service [%s] already running", s.ID)
		return nil
	}

	s.prepareLifecycleLocked()

	return s.startProcessLocked()
}

// prepareLifecycleLocked restores the context and the watcher after a stop
// the caller must hold the service mutex
func (s *Service) prepareLifecycleLocked() {
	if s.ctx.Err() != nil {
		s.ctx, s.cancel = context.WithCancel(context.Background())
	}

	s.skipNextRestart = false

	if s.watcherEnabled && s.Watcher == nil {
		if err := attachWatcherToService(s, s.ctx); err != nil {
			log.Printf("Failed to reattach watcher for service [%s]: %v", s.ID, err)
		}
	}
}

func (s *Service) startProcessLocked() error {
	log.Printf("Starting service [%s] %s", s.ID, s.MainPath)
	s.logSystem("starting process: %s", s.MainPath)

	cmd := exec.Command(path.Join(s.BootloaderPath), s.MainPath)
	cmd.Env = make([]string, 0, len(s.Env))
	cmd.Dir = s.Cwd

	// inject the env variables to cmd
	for key, value := range s.Env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	// create transformers for stdout and stderr with service ID prefix
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Failed to create stdout pipe for service [%s]: %v", s.ID, err)
		return err
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("Failed to create stderr pipe for service [%s]: %v", s.ID, err)
		return err
	}

	// start transformers in goroutines
	go s.transformOutput(stdoutPipe, os.Stdout, "stdout")
	go s.transformOutput(stderrPipe, os.Stderr, "stderr")

	err = cmd.Start()
	if err != nil {
		log.Printf("Failed to start service [%s]: %v", s.ID, err)
		s.logSystem("failed to start: %v", err)
		return err
	}

	s.Cmd = cmd
	s.Running = true
	s.skipNextRestart = false
	s.startedAt = time.Now()
	s.starts++

	// monitor process exit in goroutine
	go s.monitorProcess(cmd)

	log.Printf("Service [%s] started with PID %d", s.ID, cmd.Process.Pid)
	s.logSystem("started with pid %d", cmd.Process.Pid)

	return nil
}

func (s *Service) monitorProcess(cmd *exec.Cmd) {
	err := cmd.Wait()

	s.mutex.Lock()
	defer s.mutex.Unlock()

	// only update state if this is still the current command
	if s.Cmd == cmd {
		s.Running = false
		s.Cmd = nil

		// signal that process has terminated
		select {
		case s.processDone <- struct{}{}:
			log.Printf("Service [%s] sent process done signal", s.ID)
		default:
			// channel full, clear it first
			select {
			case <-s.processDone:
				s.processDone <- struct{}{}
			default:
			}
		}

		log.Printf("Service [%s] process exited with: %v", s.ID, err)
		s.logSystem("process exited: %v", err)

		// handle auto-restart on crash only if not skipped
		if !s.skipNextRestart && err != nil && !shuttingDown.Load() {
			log.Printf("Service [%s] crashed, will restart in 1 second", s.ID)
			s.logSystem("crashed, restarting in 1 second")

			time.AfterFunc(1*time.Second, func() {
				s.mutex.Lock()

				if !s.Running && s.ctx.Err() == nil && !shuttingDown.Load() {
					s.startProcessLocked()
				}

				s.mutex.Unlock()
			})
		} else if s.restartRequested {
			// restart was requested, execute it now
			s.restartRequested = false

			if shuttingDown.Load() {
				log.Printf("Service [%s] restart skipped, gateway is shutting down", s.ID)
			} else {
				log.Printf("Service [%s] executing requested restart", s.ID)
				s.startProcessLocked()
			}
		} else if shuttingDown.Load() {
			log.Printf("Service [%s] will not restart, gateway is shutting down", s.ID)
		}
	} else {
		log.Printf("Service [%s] old process exited (already replaced)", s.ID)
	}
}

func (s *Service) Stop() error {
	log.Printf("Stopping service [%s]", s.ID)
	s.logSystem("stopping")

	// cancel context to stop all goroutines
	s.cancel()

	s.mutex.Lock()
	s.skipNextRestart = true // skip auto-restart on shutdown

	// close watcher if exists
	if s.Watcher != nil {
		s.Watcher.Close()
		s.Watcher = nil
	}

	// stop the process if running
	if s.Cmd != nil && s.Cmd.Process != nil {
		log.Printf("Service [%s] stopping process PID %d", s.ID, s.Cmd.Process.Pid)
		s.Cmd.Process.Signal(os.Interrupt)

		// wait a bit for graceful shutdown, then force kill
		time.AfterFunc(2*time.Second, func() {
			s.mutex.Lock()

			if s.Cmd != nil && s.Cmd.Process != nil {
				log.Printf("Service [%s] forcing kill of PID %d", s.ID, s.Cmd.Process.Pid)
				s.Cmd.Process.Kill()
			}

			s.mutex.Unlock()
		})
	} else {
		// nothing to wait for when the process already exited
		s.Running = false
		s.Cmd = nil
		s.mutex.Unlock()
		log.Printf("Service [%s] stopped", s.ID)
		s.logSystem("stopped")
		return nil
	}

	s.mutex.Unlock()

	// wait for process to exit
	// TODO: check if the process was killed or crashed
	select {
	case <-s.processDone:
		log.Printf("Service [%s] process terminated", s.ID)
	case <-time.After(3 * time.Second):
		log.Printf("Service [%s] timeout waiting for process termination", s.ID)
	}

	s.mutex.Lock()
	s.Running = false
	s.Cmd = nil
	s.mutex.Unlock()

	log.Printf("Service [%s] stopped", s.ID)
	s.logSystem("stopped")
	return nil
}

func (s *Service) transformOutput(source io.Reader, destination io.Writer, streamType string) {
	scanner := bufio.NewScanner(source)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	colorCode := utils.GetColorFromString(s.ID)
	prefix := fmt.Sprintf("%s[%s]%s ", colorCode, s.ID, utils.AnsiReset)

	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(destination, "%s%s\n", prefix, line)

		if s.Logs != nil {
			s.Logs.Write("service:"+s.ID, streamType, line)
		}
	}

	if err := scanner.Err(); err != nil {
		// the pipes are closed when a process is restarted, that is expected
		if errors.Is(err, os.ErrClosed) || strings.Contains(err.Error(), "file already closed") {
			return
		}

		log.Printf("Service [%s] error reading %s: %v", s.ID, streamType, err)
	}
}

func (s *Service) Restart() {
	if shuttingDown.Load() {
		log.Printf("Service [%s] restart ignored, gateway is shutting down", s.ID)
		return
	}

	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Running {
		s.restartRequested = true
		s.skipNextRestart = true

		if s.Cmd != nil && s.Cmd.Process != nil {
			log.Printf("Service [%s] stopping process for hot-reload", s.ID)
			s.logSystem("restarting")

			s.Cmd.Process.Signal(os.Interrupt)

			// force kill after short timeout for faster restarts
			time.AfterFunc(500*time.Millisecond, func() {
				s.mutex.Lock()

				if s.Cmd != nil && s.Cmd.Process != nil && !shuttingDown.Load() {
					s.Cmd.Process.Kill()
				}

				s.mutex.Unlock()
			})
		}
	} else {
		// process not running, just start it
		s.prepareLifecycleLocked()
		s.startProcessLocked()
	}
}

// PrepareShutdown disables restarts and watchers but keeps the process alive
func (s *Service) PrepareShutdown() {
	s.cancel()

	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.skipNextRestart = true
	s.restartRequested = false

	if s.Watcher != nil {
		s.Watcher.Close()
		s.Watcher = nil
	}
}

// ForceStop kills the process immediately without a graceful window
func (s *Service) ForceStop() {
	s.cancel()

	s.mutex.Lock()
	s.skipNextRestart = true
	s.restartRequested = false

	if s.Watcher != nil {
		s.Watcher.Close()
		s.Watcher = nil
	}

	cmd := s.Cmd
	s.mutex.Unlock()

	if cmd == nil || cmd.Process == nil {
		return
	}

	log.Printf("Service [%s] force killing PID %d", s.ID, cmd.Process.Pid)
	s.logSystem("force killed")
	_ = cmd.Process.Kill()
}
