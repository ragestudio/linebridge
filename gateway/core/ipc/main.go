package ipc

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"
	"ultragateway/structs"
)

type IPCListenerInterface interface {
	RegisterHandler(eventType string, handler func(*structs.EventData, *json.RawMessage))
	Start() error
	Stop()
	GetSocketPath() string
	IsRunning() bool
}

type Instance struct {
	SocketPath string
	Listener   net.Listener
	Handlers   map[string]func(*structs.EventData, *json.RawMessage)
	Mu         sync.RWMutex
	Running    bool
	Wg         sync.WaitGroup
}

type NewListenerOptions struct {
	Config            structs.BaseConfig
	OnServiceRegister func(*structs.EventData, *json.RawMessage)
}

func New(options *NewListenerOptions) (*Instance, error) {
	if options.Config.IPC.Path == "" {
		return nil, errors.New("IPC Listener needs a path to create the socket. Missing `config.ipc.path`")
	}

	listener := &Instance{
		SocketPath: options.Config.IPC.Path,
		Handlers:   make(map[string]func(*structs.EventData, *json.RawMessage)),
	}

	if options.OnServiceRegister != nil {
		listener.RegisterHandler("service:register", options.OnServiceRegister)
	}

	if err := listener.Start(); err != nil {
		return nil, err
	}

	log.Println("IPC socket listener started")

	return listener, nil
}

func (instance *Instance) RegisterHandler(eventType string, handler func(*structs.EventData, *json.RawMessage)) {
	instance.Mu.Lock()
	defer instance.Mu.Unlock()

	instance.Handlers[eventType] = handler
}

func (instance *Instance) Start() error {
	instance.Mu.Lock()
	defer instance.Mu.Unlock()

	if instance.Running {
		return fmt.Errorf("socket listener already running")
	}

	// remove existing socket file if it exists
	if err := os.RemoveAll(instance.SocketPath); err != nil {
		return fmt.Errorf("failed to remove existing socket: %w", err)
	}

	// create directory for socket if it not exist
	socketDir := filepath.Dir(instance.SocketPath)
	if err := os.MkdirAll(socketDir, 0755); err != nil {
		return fmt.Errorf("failed to create socket directory: %w", err)
	}

	// start listening
	listener, err := net.Listen("unix", instance.SocketPath)
	if err != nil {
		return fmt.Errorf("failed to listen on socket: %w", err)
	}

	// fix the permissions
	if err := os.Chmod(instance.SocketPath, 0666); err != nil {
		listener.Close()
		return fmt.Errorf("failed to set socket permissions: %w", err)
	}

	instance.Listener = listener
	instance.Running = true

	instance.Wg.Add(1)
	go instance.acceptConnections()

	log.Printf("Unix socket listener started on %s", instance.SocketPath)
	return nil
}

func (instance *Instance) Stop() {
	instance.Mu.Lock()

	if !instance.Running {
		instance.Mu.Unlock()
		return
	}

	instance.Running = false
	instance.Mu.Unlock()

	if instance.Listener != nil {
		instance.Listener.Close()
	}

	instance.Wg.Wait()

	os.Remove(instance.SocketPath)
	log.Printf("Unix socket listener stopped")
}

func (instance *Instance) acceptConnections() {
	defer instance.Wg.Done()

	for {
		conn, err := instance.Listener.Accept()

		if err != nil {
			instance.Mu.RLock()
			running := instance.Running
			instance.Mu.RUnlock()

			if !running {
				return
			}

			log.Printf("Error accepting connection: %v", err)

			continue
		}

		instance.Wg.Add(1)
		go instance.handleConnection(conn)
	}
}

func (instance *Instance) handleConnection(conn net.Conn) {
	defer conn.Close()
	defer instance.Wg.Done()

	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	decoder := json.NewDecoder(conn)

	for {
		var rawMessage json.RawMessage
		var event structs.EventData

		// get the raw message bytes before decoding
		if err := decoder.Decode(&rawMessage); err != nil {
			if err.Error() != "EOF" {
				log.Printf("Error decoding JSON: %v", err)
			}
			return
		}

		// decode the raw message into the event struct
		if err := json.Unmarshal(rawMessage, &event); err != nil {
			log.Printf("Error unmarshaling event data: %v", err)
			return
		}

		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		instance.processEvent(&event, &rawMessage)
	}
}

func (instance *Instance) processEvent(event *structs.EventData, rawMessage *json.RawMessage) {
	instance.Mu.RLock()
	handler, exists := instance.Handlers[event.Event]
	instance.Mu.RUnlock()

	if !exists {
		log.Printf("No handler registered for event type: %s", event.Event)
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic in event handler for %s: %v", event.Event, r)
			}
		}()

		handler(event, rawMessage)
	}()
}

func (instance *Instance) GetSocketPath() string {
	return instance.SocketPath
}

func (instance *Instance) IsRunning() bool {
	instance.Mu.RLock()
	defer instance.Mu.RUnlock()

	return instance.Running
}
