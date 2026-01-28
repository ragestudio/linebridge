package services

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
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

type Service struct {
	id           string
	mainPath     string
	cwd          string
	cmd          *exec.Cmd
	env          map[string]string
	running      bool
	watcher      *fsnotify.Watcher
	listenSocket string
	socketClient *client.Client
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

	// create the service obj
	serviceObj := &Service{
		id:       options.Id,
		mainPath: options.MainPath,
		cwd:      options.Cwd,
		env:      options.Env,
		running:  false,
	}

	if options.EnableWatcher {
		err := AttachWatcherToService(serviceObj)

		if err != nil {
			log.Printf("Failed to create watcher for service [%s]: %v", serviceObj.id, err)
			return nil
		}
	}

	serviceObj.cmd = exec.Command(options.BootloaderPath, options.MainPath)
	serviceObj.cmd.Dir = serviceObj.cwd

	// inject the env variables to cmd
	serviceObj.cmd.Env = make([]string, 0, len(options.Env))
	for key, value := range options.Env {
		serviceObj.cmd.Env = append(serviceObj.cmd.Env, fmt.Sprintf("%s=%s", key, value))
	}

	log.Printf("Service [%s] created", serviceObj.id)

	return serviceObj
}

func AttachWatcherToService(service *Service) error {
	watcher, err := fsnotify.NewWatcher()

	if err != nil {
		return err
	}

	service.watcher = watcher

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				log.Println("event:", event)

				if event.Has(fsnotify.Write) {
					log.Println("modified file:", event.Name)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}

				log.Println("error:", err)
			}
		}
	}()

	watcher.Add(service.cwd)

	return nil
}

func (service *Service) Start() error {
	log.Printf("Starting service [%s] %s", service.id, service.mainPath)

	// pipe stdout and stderr to the current process
	service.cmd.Stdout = os.Stdout
	service.cmd.Stderr = os.Stderr

	err := service.cmd.Start()

	if err != nil {
		log.Printf("Failed to start service [%s]: %v", service.id, err)
		return err
	}

	service.running = true

	// listen when the process exit to handle a cleanup
	go func() {
		err := service.cmd.Wait()

		service.running = false

		if service.watcher != nil {
			service.watcher.Close()
		}

		if err != nil {
			log.Printf("Service [%s] exited with error: %v", service.id, err)
		} else {
			log.Printf("Service [%s] exited", service.id)
		}
	}()

	return nil
}

func (service *Service) Stop() error {
	log.Printf("Stopping service [%s]", service.id)

	err := service.cmd.Process.Kill()

	if err != nil {
		log.Printf("Failed to stop service [%s]: %v", service.id, err)
		return err
	}

	return nil
}

func (service *Service) Restart() error {
	log.Printf("Restarting service [%s]", service.id)

	err := service.Stop()

	if err != nil {
		return err
	}

	err = service.Start()

	if err != nil {
		return err
	}

	return nil
}

func (service *Service) SetListenSocket(socket string) error {
	service.listenSocket = socket

	newClient, err := utils.NewUnixSocketClient(socket)

	if err != nil {
		log.Printf("Failed to create socket client for service [%s]: %v", service.id, err)
		return err
	}

	service.socketClient = newClient

	return nil
}

func (service *Service) GetListenSocket() string {
	return service.listenSocket
}

func (service *Service) GetSocketClient() *client.Client {
	return service.socketClient
}

func (service *Service) Ctx() *Service {
	return service
}
