package requests

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
)

type HealthResponse struct {
	Status           string `json:"status"`
	Uptime           string `json:"uptime"`
	NatsConnected    bool   `json:"nats_connected"`
	ServicesRunning  int    `json:"services_running"`
	ServicesExpected int    `json:"services_expected"`
	ShuttingDown     bool   `json:"shutting_down,omitempty"`
	SysInfo          any    `json:"sys_info"`
}

var IsShuttingDown atomic.Bool

func (instance *Requests) Health(mctx context.Context, ctx *app.RequestContext) {
	runningCount := 0

	for _, svc := range instance.Services {
		if svc.IsRunning() {
			runningCount++
		}
	}

	natsOk := instance.WebsocketManager != nil &&
		instance.WebsocketManager.Nats != nil &&
		instance.WebsocketManager.Nats.Client != nil &&
		instance.WebsocketManager.Nats.Client.IsConnected()

	resp := HealthResponse{
		Status:           "ok",
		Uptime:           time.Since(instance.StartTime).String(),
		NatsConnected:    natsOk,
		ServicesRunning:  runningCount,
		ServicesExpected: len(instance.Services),
		SysInfo:          instance.SysInfo,
	}

	if IsShuttingDown.Load() {
		resp.Status = "draining"
		resp.ShuttingDown = true
		ctx.SetStatusCode(202)
		ctx.JSON(202, resp)
		return
	}

	if !natsOk || runningCount < len(instance.Services) {
		resp.Status = "degraded"
		ctx.SetStatusCode(503)
		ctx.JSON(503, resp)
		return
	}

	ctx.JSON(200, resp)
}
