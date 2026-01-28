package requests

import (
	"time"
	"ultragateway/core/services"
	"ultragateway/core/websocket"
	"ultragateway/structs"
)

type Requests struct {
	ProductName      string
	ProductVersion   string
	StartTime        time.Time
	SysInfo          map[string]any
	ProjectJSON      *structs.PackageJSON
	Config           *structs.BaseConfig
	WebsocketManager *websocket.Instance
	Services         map[string]*services.Service
}
