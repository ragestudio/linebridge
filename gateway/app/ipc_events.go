package app

import (
	"encoding/json"
	"log"
	"ultragateway/structs"
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

func (ctx *IpcEvents) OnRegisterServiceEvent(payload structs.EventData) {
	data := payload.Data.(map[string]interface{})

	var register = ServiceRegisterEvent{}

	// marshal the map back to json bytes for unmarshaling
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("Failed to marshal service registration data: %v", err)
		return
	}

	err = json.Unmarshal(jsonData, &register)
	if err != nil {
		log.Printf("Failed to unmarshal service registration data: %v", err)
		return
	}

	// lookup for service
	service := ctx.AppData.Services[register.Namespace]

	if service == nil {
		log.Printf("Service not found: %v", register.Namespace)
		return
	}

	log.Printf("Registering [%v] service", register.Namespace)

	if register.Listen.Socket != "" {
		// set the listen socket of the service
		service.SetListenSocket(register.Listen.Socket)

		for _, event := range register.Ws.Events {
			ctx.AppData.Nats.RegisterServiceEvent(register.Namespace, event)
		}
	}
}
