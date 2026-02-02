package jsvm

import (
	"log"

	"github.com/dop251/goja"
)

func (instance *JSVM) CreateConsoleObj() *goja.Object {
	obj := instance.Runtime.NewObject()

	obj.Set("log", func(call goja.FunctionCall) goja.Value {
		for _, arg := range call.Arguments {
			log.Println(arg.String())
		}

		return goja.Undefined()
	})

	obj.Set("error", func(call goja.FunctionCall) goja.Value {
		for _, arg := range call.Arguments {
			log.Println(arg.String())
		}

		return goja.Undefined()
	})

	obj.Set("warn", func(call goja.FunctionCall) goja.Value {
		for _, arg := range call.Arguments {
			log.Println(arg.String())
		}

		return goja.Undefined()
	})

	obj.Set("info", func(call goja.FunctionCall) goja.Value {
		for _, arg := range call.Arguments {
			log.Println(arg.String())
		}

		return goja.Undefined()
	})

	return obj
}
