package requests

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
)

func (instance *Requests) Ping(mctx context.Context, ctx *app.RequestContext) {
	ctx.SetStatusCode(200)
}
