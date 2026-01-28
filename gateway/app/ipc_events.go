package app

import (
	"encoding/json"
	"log"
	"strings"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
)

type IpcEvents struct {
	AppData *AppData
}

type IpcEventsInterface interface {
	OnRegisterServiceEvent(data json.RawMessage)
}

type ServiceRegisterEvent struct {
	Namespace string `json:"namespace"`
	Secure    bool   `json:"secure"`
	Http      struct {
		Enabled bool     `json:"enabled"`
		Proto   string   `json:"proto"`
		Paths   []string `json:"paths"`
	} `json:"http"`
	Ws struct {
		Enabled bool     `json:"enabled"`
		Proto   string   `json:"proto"`
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
				namespacePath := strings.Split(path, "/")[1]
				ctx.AppData.HttpPathsRefs.Store(namespacePath, register.Data.Namespace)
			}
		}
	}

	if register.Data.Listen.Socket != "" {
		// set the listen socket of the service
		service.SetListenSocket(register.Data.Listen.Socket)

		for _, event := range register.Data.Ws.Events {
			ctx.AppData.Nats.RegisterServiceEvent(register.Data.Namespace, event)
		}
	}

	log.Printf("[%v] Service registered via IPC", register.Data.Namespace)
}
