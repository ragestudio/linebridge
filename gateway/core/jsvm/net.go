package jsvm

import (
	"github.com/dop251/goja"
)

type NetRequest struct {
	*JSVM
}

func (instance *JSVM) CreateNetObj() *goja.Object {
	obj := instance.Runtime.NewObject()

	netRequest := &NetRequest{
		instance,
	}

	obj.Set("fetch", netRequest.Fetch)

	return obj
}
