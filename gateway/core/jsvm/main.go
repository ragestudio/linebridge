package jsvm

import (
	"ultragateway/core/websocket"

	"github.com/dop251/goja"
)

type JSVM struct {
	Runtime          *goja.Runtime
	WebsocketManager *websocket.Instance
}

func Create(instance *JSVM) *JSVM {
	instance.Runtime = goja.New()

	instance.Runtime.GlobalObject().Set("console", instance.CreateConsoleObj())
	instance.Runtime.GlobalObject().Set("gateway", instance.CreateGatewayObj())
	instance.Runtime.GlobalObject().Set("net", instance.CreateNetObj())

	return instance
}
