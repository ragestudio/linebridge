package requests

import (
	"bytes"
	"context"
	"log"
	"time"

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
		ctx.SetStatusCode(consts.StatusNoContent)
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

	timeoutCtx, cancel := context.WithTimeout(mctx, 30*time.Second)
	defer cancel()

	req := protocol.AcquireRequest()
	res := protocol.AcquireResponse()

	defer protocol.ReleaseRequest(req)
	defer protocol.ReleaseResponse(res)

	ctx.Request.CopyTo(req)
	req.Header.SetHostBytes(ctx.Host())

	// clean hop-by-hop headers that should not be forwarded
	req.Header.Del("Connection")
	req.Header.Del("Proxy-Connection")
	req.Header.Del("Keep-Alive")
	req.Header.Del("Proxy-Authenticate")
	req.Header.Del("Proxy-Authorization")
	req.Header.Del("TE")
	req.Header.Del("Trailers")
	req.Header.Del("Transfer-Encoding")
	req.Header.Del("Upgrade")

	if ctx.Request.IsBodyStream() {
		contentLength := ctx.Request.Header.ContentLength()
		req.SetBodyStream(ctx.Request.BodyStream(), contentLength)

		if contentLength == -1 {
			req.Header.DelBytes([]byte("Content-Length"))
		} else {
			req.Header.DelBytes([]byte("Transfer-Encoding"))
		}
	}

	// execute the request with timeout
	err := client.Do(timeoutCtx, req, res)

	if err != nil {
		log.Printf("proxy error forwarding request: %v", err)

		if timeoutCtx.Err() == context.DeadlineExceeded {
			ctx.JSON(consts.StatusGatewayTimeout, map[string]string{
				"message": "Request timeout",
			})
		} else {
			ctx.JSON(consts.StatusBadGateway, map[string]string{
				"message": err.Error(),
			})
		}

		return
	}

	// set some gateway headers
	res.Header.Set("Connection", "close")
	res.Header.Set(instance.ProductName, instance.ProductVersion)

	// pipe the response from the client response
	res.CopyTo(&ctx.Response)
}
