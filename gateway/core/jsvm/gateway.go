package jsvm

import (
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
		fn(goja.Undefined(), instance.Runtime.ToValue(data))
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
