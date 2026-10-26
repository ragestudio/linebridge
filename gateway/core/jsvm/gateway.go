package jsvm

import (
	"log"

	"github.com/dop251/goja"
)

type WebsocketInternalEventRegister struct {
	*JSVM
}

func (instance *WebsocketInternalEventRegister) Do(call goja.FunctionCall) goja.Value {
	if len(call.Arguments) < 2 {
		return goja.Undefined()
	}

	argEventStr := call.Argument(0)
	argFunc := call.Argument(1)

	event := argEventStr.String()

	if event == "" {
		return instance.Runtime.NewTypeError("invalid event name")
	}

	fn, ok := goja.AssertFunction(argFunc)

	if !ok {
		return instance.Runtime.NewTypeError("invalid function type")
	}

	instance.WebsocketManager.InternalEvents.RegisterHandler(event, func(data any) {
		// the event is dispatched from connection goroutines, serialize the
		// access to the shared runtime
		instance.mutex.Lock()
		defer instance.mutex.Unlock()

		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("jsvm | event [%s] handler panic: %v", event, recovered)
			}
		}()

		_, err := fn(goja.Undefined(), instance.Runtime.ToValue(data))

		if err != nil && IsDebug {
			log.Printf("jsvm | event [%s] handler error: %v", event, err)
		}
	})

	return goja.Undefined()
}

func (instance *JSVM) CreateGatewayObj() *goja.Object {
	obj := instance.Runtime.NewObject()

	websocketObj := instance.Runtime.NewObject()
	websocketObj.Set("registerInternalEvent", (&WebsocketInternalEventRegister{instance}).Do)

	obj.Set("websockets", websocketObj)

	return obj
}
