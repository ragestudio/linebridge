package requests

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
)

func (instance *Requests) Index(mctx context.Context, ctx *app.RequestContext) {
	data := map[string]any{
		"gateway":    instance.ProductName,
		"lb_version": instance.ProductVersion,
		"uptime":     time.Since(instance.StartTime).String(),
		"sys_info":   instance.SysInfo,
	}

	if instance.ProjectJSON != nil {
		data["version"] = instance.ProjectJSON.Version
		data["name"] = instance.ProjectJSON.Name
	}

	ctx.JSON(200, data)
}
