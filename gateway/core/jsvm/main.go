package jsvm

import (
	"os"
	"sync"

	"ultragateway/core/websocket"

	"github.com/dop251/goja"
)

var IsDebug = os.Getenv("DEBUG") == "true"

type JSVM struct {
	Runtime          *goja.Runtime
	WebsocketManager *websocket.Instance

	// goja runtimes are not goroutine safe, internal events are triggered
	// from every connection goroutine so all access is serialized
	mutex sync.Mutex
}

func Create(instance *JSVM) *JSVM {
	instance.Runtime = goja.New()

	instance.Runtime.GlobalObject().Set("console", instance.CreateConsoleObj())
	instance.Runtime.GlobalObject().Set("gateway", instance.CreateGatewayObj())
	instance.Runtime.GlobalObject().Set("net", instance.CreateNetObj())

	return instance
}
