package http

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
	"ultragateway/structs"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/cloudwego/hertz/pkg/protocol"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

type CustomRouteHandler struct {
	Route  structs.CustomRoute
	Client *client.Client
}

func (proxy *CustomRouteHandler) exec(mctx context.Context, ctx *app.RequestContext) {
	// handle WebSocket upgrade
	if proxy.Route.Websocket && ctx.IsGet() && strings.Contains(string(ctx.Request.Header.Peek("Upgrade")), "websocket") {
		proxy.handleWebSocket(mctx, ctx)
		return
	}

	if proxy.Client == nil {
		ctx.AbortWithStatusJSON(http.StatusInternalServerError, struct {
			Message string `json:"message"`
		}{
			Message: "Client is not initialized",
		})
		return
	}

	req := protocol.AcquireRequest()
	res := protocol.AcquireResponse()

	defer protocol.ReleaseRequest(req)
	defer protocol.ReleaseResponse(res)

	// create a timeout context to prevent hanging
	timeoutCtx, cancel := context.WithTimeout(mctx, 30*time.Second)
	defer cancel()

	// copy the original request
	ctx.Request.CopyTo(req)

	// remove connection headers that might interfere with proxy
	req.Header.Del("Connection")
	req.Header.Del("Proxy-Connection")
	req.Header.Del("Keep-Alive")
	req.Header.Del("Proxy-Authenticate")
	req.Header.Del("Proxy-Authorization")
	req.Header.Del("TE")
	req.Header.Del("Trailers")
	req.Header.Del("Transfer-Encoding")
	req.Header.Del("Upgrade")

	// get the original path
	originalPath := string(ctx.Path())
	targetURLStr := proxy.Route.Target

	// parse target URL to extract host
	targetURL, err := url.Parse(targetURLStr)
	if err != nil {
		log.Printf("Failed to parse target URL %s: %v", targetURLStr, err)
		ctx.JSON(consts.StatusInternalServerError, map[string]string{
			"message": "Invalid target URL configuration",
		})
		return
	}

	// apply path rewrite if configured
	finalPath := originalPath
	if len(proxy.Route.PathRewrite) > 0 {
		finalPath = applyPathRewrite(originalPath, proxy.Route.PathRewrite)
	} else {
		// fallback: remove the route prefix
		routePath := proxy.Route.Path
		// remove wildcard from route path for matching
		routePath = strings.TrimSuffix(routePath, "/*path")
		routePath = strings.TrimSuffix(routePath, "/*")

		if strings.HasPrefix(originalPath, routePath) {
			finalPath = strings.TrimPrefix(originalPath, routePath)
		}
	}

	// ensure finalPath is valid
	if finalPath == "" {
		finalPath = "/"
	}

	// clean up any double slashes
	finalPath = strings.Replace(finalPath, "//", "/", -1)

	// build the full target URL
	fullURL := targetURLStr

	// ensure target URL ends with /
	if !strings.HasSuffix(fullURL, "/") {
		fullURL += "/"
	}

	// add the final path, removing leading / if present
	if finalPath != "/" {
		fullURL += strings.TrimPrefix(finalPath, "/")
	}

	// set the request URI
	req.SetRequestURI(fullURL)

	// set host to target URL's host for proper routing
	if targetURL.Host != "" {
		req.SetHost(targetURL.Host)
	} else {
		req.SetHost(string(ctx.Host()))
	}

	// execute the request with timeout context
	err = proxy.Client.Do(timeoutCtx, req, res)

	// ensure response headers are properly set
	if res.Header.ContentLength() == 0 && res.Body() != nil {
		res.Header.SetContentLength(len(res.Body()))
	}

	if err != nil {
		// check if error is due to timeout
		if timeoutCtx.Err() == context.DeadlineExceeded {
			log.Printf("proxy timeout forwarding request to %s", fullURL)
			ctx.JSON(consts.StatusGatewayTimeout, map[string]string{
				"message": "Request timeout",
			})
		} else {
			log.Printf("proxy error forwarding request to %s: %v", fullURL, err)
			ctx.JSON(consts.StatusBadGateway, map[string]string{
				"message": err.Error(),
			})
		}
		return

	}

	// zero-copy merge the response
	res.CopyTo(&ctx.Response)

	// ensure connection is closed to prevent hanging
	ctx.Response.Header.Set("Connection", "close")
}

func applyPathRewrite(originalPath string, pathRewrite map[string]string) string {
	// try patterns in order
	for pattern, replacement := range pathRewrite {
		// remove ^ from pattern if present
		cleanPattern := strings.TrimPrefix(pattern, "^")

		// check for wildcard pattern like "/spectrum/(.*)"
		if strings.Contains(cleanPattern, "(.*)") {
			prefix := strings.TrimSuffix(cleanPattern, "(.*)")
			if strings.HasPrefix(originalPath, prefix) {
				// extract everything after the prefix
				remaining := originalPath[len(prefix):]
				// apply replacement
				result := strings.Replace(replacement, "$1", remaining, 1)
				// clean up any double slashes
				result = strings.Replace(result, "//", "/", -1)
				return result
			}
		} else {
			// exact prefix match
			if strings.HasPrefix(originalPath, cleanPattern) {
				// replace the prefix
				result := strings.Replace(originalPath, cleanPattern, replacement, 1)
				// clean up any double slashes
				result = strings.Replace(result, "//", "/", -1)
				return result
			}
		}
	}

	return originalPath
}

func (proxy *CustomRouteHandler) handleWebSocket(mctx context.Context, ctx *app.RequestContext) {
	// for WebSocket, we need to use a different approach
	// since Hertz doesn't have built-in WebSocket proxy support
	// we'll return a not implemented error for now
	// TODO: implement proper WebSocket proxying

	log.Printf("WebSocket connection attempted to %s", proxy.Route.Path)

	ctx.JSON(consts.StatusNotImplemented, map[string]string{
		"message": "WebSocket proxying not yet implemented for custom routes",
	})
}
