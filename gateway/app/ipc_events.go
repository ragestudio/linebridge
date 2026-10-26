package app

import (
	"encoding/json"
	"log"
	"strings"
	"time"
	"ultragateway/core/services"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
)

type IpcEvents struct {
	AppData *App
}

type IpcEventsInterface interface {
	OnRegisterServiceEvent(data json.RawMessage)
}

type RouteRegister struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type ServiceRegisterEvent struct {
	Namespace string `json:"namespace"`
	Secure    bool   `json:"secure"`
	Http      struct {
		Enabled bool            `json:"enabled"`
		Proto   string          `json:"proto"`
		Paths   []string        `json:"paths"`
		Routes  []RouteRegister `json:"routes"`
	} `json:"http"`
	Ws struct {
		Enabled bool     `json:"enabled"`
		Proto   string   `json:"proto"`
		Path    string   `json:"path"`
		Events  []string `json:"events"`
	} `json:"websocket"`
	Listen struct {
		Ip     string `json:"ip"`
		Port   int    `json:"port"`
		Socket string `json:"socket"`
	} `json:"listen"`
}

func (ctx *IpcEvents) OnRegisterServiceEvent(payload *structs.EventData, rawMessage *json.RawMessage) {
	var register struct {
		Data ServiceRegisterEvent `json:"data"`
	}

	if err := sonic.Unmarshal(*rawMessage, &register); err != nil {
		log.Printf("Failed to unmarshal service registration data: %v", err)
		return
	}

	// lookup for service
	service := ctx.AppData.Services[register.Data.Namespace]

	if service == nil {
		log.Printf("Cannot register [%v] service, cause is not found on services pool", register.Data.Namespace)
		return
	}

	// TODO: maybe something nicer than iterating over & over for all paths
	if register.Data.Http.Enabled {
		if len(register.Data.Http.Paths) > 0 {
			for _, path := range register.Data.Http.Paths {
				segments := strings.Split(strings.TrimPrefix(path, "/"), "/")

				if len(segments) == 0 || segments[0] == "" {
					continue
				}

				ctx.AppData.HttpPathsRefs.Store(segments[0], register.Data.Namespace)
			}
		}
	}

	if register.Data.Listen.Socket != "" {
		// set the listen socket of the service
		service.SetListenSocket(register.Data.Listen.Socket)
	}

	// nats routing does not depend on the http socket, register the events
	// every time the service advertises them
	for _, event := range register.Data.Ws.Events {
		ctx.AppData.Nats.RegisterServiceEvent(register.Data.Namespace, event)
	}

	registration := services.Registration{
		Namespace:    register.Data.Namespace,
		Secure:       register.Data.Secure,
		HTTPEnabled:  register.Data.Http.Enabled,
		HTTPProto:    register.Data.Http.Proto,
		Paths:        register.Data.Http.Paths,
		Routes:       make([]services.Route, 0, len(register.Data.Http.Routes)),
		WSEnabled:    register.Data.Ws.Enabled,
		WSProto:      register.Data.Ws.Proto,
		WSPath:       register.Data.Ws.Path,
		WSEvents:     register.Data.Ws.Events,
		IP:           register.Data.Listen.Ip,
		Port:         register.Data.Listen.Port,
		Socket:       register.Data.Listen.Socket,
		RegisteredAt: time.Now().Unix(),
	}

	for _, route := range register.Data.Http.Routes {
		registration.Routes = append(registration.Routes, services.Route{
			Method: route.Method,
			Path:   route.Path,
		})
	}

	service.SetRegistration(registration)

	log.Printf("[%v] Service registered via IPC", register.Data.Namespace)

	if ctx.AppData.IsDebug {
		log.Println(sonic.MarshalString(rawMessage))
	}
}
