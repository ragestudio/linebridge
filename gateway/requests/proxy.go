package requests

import (
	"bytes"
	"context"
	"log"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

func GetNamespaceFromPath(path []byte) string {
	var namespace string

	if len(path) > 1 && path[0] == '/' {
		idx := bytes.IndexByte(path[1:], '/')
		if idx == -1 {
			namespace = string(path[1:])
		} else {
			namespace = string(path[1 : idx+1])
		}
	}

	return namespace
}

func (instance *Requests) ProxyHandler(mctx context.Context, ctx *app.RequestContext) {
	requestMethod := ctx.Method()

	if bytes.Equal(requestMethod, []byte("OPTIONS")) {
		ctx.SetStatusCode(consts.StatusOK)
		return
	}

	requestNamespace := GetNamespaceFromPath(ctx.Path())

	serviceRef, ok := instance.HttpPathsRefs.Load(requestNamespace)

	if !ok {
		ctx.JSON(consts.StatusBadGateway, map[string]string{
			"message": "No service available for this namespace",
		})
		return
	}

	service, ok := instance.Services[serviceRef.(string)]

	if !ok {
		ctx.JSON(consts.StatusBadGateway, map[string]string{
			"message": "No service available for this namespace",
		})
		return
	}

	client := service.GetSocketClient()

	if client == nil {
		ctx.JSON(consts.StatusBadGateway, map[string]string{
			"message": "No listen socket available for this service",
		})
		return
	}

	req := protocol.AcquireRequest()
	res := protocol.AcquireResponse()

	defer protocol.ReleaseRequest(req)
	defer protocol.ReleaseResponse(res)

	// copy req
	ctx.Request.CopyTo(req)

	// set the host
	req.SetHost(string(ctx.Host()))

	err := client.Do(mctx, req, res)

	if err != nil {
		log.Printf("proxy error forwarding request: %v", err)

		ctx.JSON(consts.StatusBadGateway, map[string]string{
			"message": err.Error(),
		})

		return
	}

	// zero-copy merge
	res.CopyTo(&ctx.Response)
}
