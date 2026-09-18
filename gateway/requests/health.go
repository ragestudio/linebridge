package requests

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
)

type HealthResponse struct {
	Status           string `json:"status"`
	Uptime           string `json:"uptime"`
	NatsConnected    bool   `json:"nats_connected"`
	ServicesRunning  int    `json:"services_running"`
	ServicesExpected int    `json:"services_expected"`
	WebsocketConns   int    `json:"websocket_connections"`
	ShuttingDown     bool   `json:"shutting_down,omitempty"`
}

var IsShuttingDown = false

func (instance *Requests) Health(mctx context.Context, ctx *app.RequestContext) {
	runningCount := 0

	for _, svc := range instance.Services {
		if svc.Running {
			runningCount++
		}
	}

	wsConnCount := 0
	if instance.WebsocketManager != nil && instance.WebsocketManager.Connections != nil {
		instance.WebsocketManager.Connections.Clients.Range(func(key, value any) bool {
			wsConnCount++
			return true
		})
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
		WebsocketConns:   wsConnCount,
	}

	if IsShuttingDown {
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
