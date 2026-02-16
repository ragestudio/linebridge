package services

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
	"ultragateway/utils"

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

	mutex            sync.Mutex
	ctx              context.Context
	cancel           context.CancelFunc
	restartRequested bool
	processDone      chan struct{}
	skipNextRestart  bool
}

type NewServiceOptions struct {
	Id                string
	MainPath          string
	Cwd               string
	Env               map[string]string
	EnableWatcher     bool
	GatewaySocketPath string
	BootloaderPath    string
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
	}

	if options.EnableWatcher {
		err := attachWatcherToService(serviceObj)
		if err != nil {
			log.Printf("Failed to create watcher for service [%s]: %v", serviceObj.ID, err)
		}
	}

	log.Printf("Service [%s] created", serviceObj.ID)
	return serviceObj
}

func (s *Service) Start() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Running {
		log.Printf("Service [%s] already running", s.ID)
		return nil
	}

	return s.startProcessLocked()
}

func (s *Service) startProcessLocked() error {
	log.Printf("Starting service [%s] %s", s.ID, s.MainPath)

	cmd := exec.Command(s.BootloaderPath, s.MainPath)
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
		return err
	}

	s.Cmd = cmd
	s.Running = true
	s.skipNextRestart = false

	// monitor process exit in goroutine
	go s.monitorProcess(cmd)

	log.Printf("Service [%s] started with PID %d", s.ID, cmd.Process.Pid)
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

		// handle auto-restart on crash only if not skipped
		if IsDebug && !s.skipNextRestart && err != nil {
			log.Printf("Service [%s] crashed, will restart in 1 second", s.ID)

			time.AfterFunc(1*time.Second, func() {
				s.mutex.Lock()

				if !s.Running && s.ctx.Err() == nil {
					s.startProcessLocked()
				}

				s.mutex.Unlock()
			})
		} else if s.restartRequested {
			// restart was requested, execute it now
			s.restartRequested = false
			log.Printf("Service [%s] executing requested restart", s.ID)
			s.startProcessLocked()
		}
	} else {
		log.Printf("Service [%s] old process exited (already replaced)", s.ID)
	}
}

func (s *Service) Stop() error {
	log.Printf("Stopping service [%s]", s.ID)

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
	}

	s.mutex.Unlock()

	// wait for process to exit
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
	return nil
}

func (s *Service) transformOutput(source io.Reader, destination io.Writer, streamType string) {
	scanner := bufio.NewScanner(source)
	colorCode := utils.GetColorFromString(s.ID)
	prefix := fmt.Sprintf("%s[%s]%s ", colorCode, s.ID, utils.AnsiReset)

	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(destination, "%s%s\n", prefix, line)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Service [%s] error reading %s: %v", s.ID, streamType, err)
	}
}

func (s *Service) Restart() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Running {
		s.restartRequested = true
		s.skipNextRestart = true

		if s.Cmd != nil && s.Cmd.Process != nil {
			log.Printf("Service [%s] stopping process for hot-reload", s.ID)

			s.Cmd.Process.Signal(os.Interrupt)

			// force kill after short timeout for faster restarts
			time.AfterFunc(500*time.Millisecond, func() {
				s.mutex.Lock()

				if s.Cmd != nil && s.Cmd.Process != nil {
					s.Cmd.Process.Kill()
				}

				s.mutex.Unlock()
			})
		}
	} else {
		// process not running, just start it
		s.startProcessLocked()
	}
}
