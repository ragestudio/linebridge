package requests

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
)

var isDebug = os.Getenv("DEBUG") == "true"

func (h *Requests) MainMiddleware(mctx context.Context, ctx *app.RequestContext) {
	start := time.Now()

	// add server header
	ctx.Header(h.ProductName, h.ProductVersion)
	ctx.Response.Header.Del("server")

	// add cors headers
	ctx.Header("Access-Control-Allow-Origin", "*")
	ctx.Header("Access-Control-Allow-Headers", "*")
	ctx.Header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT, PATCH, OPTIONS")

	// add content type header
	ctx.Header("Content-Type", "application/json")

	// call next middleware
	ctx.Next(mctx)

	// debug the request if debug is enabled
	if isDebug {
		// calculate duration
		duration := time.Since(start)

		method := strings.ToUpper(string(ctx.Method()))
		statusCode := ctx.GetResponse().StatusCode()

		log.Printf("%s %d %s %s", method, statusCode, ctx.Path(), duration)
	}
}
