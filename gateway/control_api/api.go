package control_api

import (
	"context"
	"log"
	"time"

	"ultragateway/structs"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/config"
)

type ControlAPI struct {
	Server *server.Hertz
}

const (
	DefaultPort = ":9090"
)

type NewControlAPIOptions struct {
	Config *structs.BaseConfig
}

func NewControlAPI(options *NewControlAPIOptions) *ControlAPI {
	instance := &ControlAPI{}

	srvOptions := []config.Option{
		server.WithHostPorts(DefaultPort),
		server.WithDisablePrintRoute(true),
		server.WithExitWaitTime(time.Second),
	}

	if options.Config != nil {
		if options.Config.ControlAPI.Listen != "" {
			// spoky
			srvOptions[0] = server.WithHostPorts(options.Config.ControlAPI.Listen)
		}
	}

	instance.Server = server.New(srvOptions...)

	instance.Server.GET("/", instance.MainIndexRequest)

	go instance.Server.Spin()

	log.Printf("Control API started on [%s]", instance.Server.GetOptions().Addr)

	return instance
}

func (api *ControlAPI) MainIndexRequest(c context.Context, ctx *app.RequestContext) {
	ctx.JSON(200, struct {
		Message string `json:"message"`
	}{
		Message: "Control API is running",
	})
}
