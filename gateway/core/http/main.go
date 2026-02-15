package http

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
	"ultragateway/requests"

	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/adaptor"
	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/hertz-contrib/http2/factory"
	"github.com/hertz-contrib/pprof"
)

var IsDebug = os.Getenv("DEBUG") == "true"

type CreateEngineOptions struct {
	WaitGroup  *sync.WaitGroup
	Requests   *requests.Requests
	TLSConfig  *tls.Config
	ListenPort int
}

func CreateEngine(parameters CreateEngineOptions) {
	if parameters.WaitGroup != nil {
		defer parameters.WaitGroup.Done()
	}

	options := []config.Option{
		server.WithMaxRequestBodySize(10 * 1024 * 1024),
		server.WithExitWaitTime(time.Second),
		server.WithHostPorts(fmt.Sprintf(":%d", parameters.ListenPort)),
		server.WithDisablePrintRoute(true),
	}

	// if tlsConfig is present, enable TLS and HTTP/2
	if parameters.TLSConfig != nil {
		options = append(
			options,
			server.WithTLS(parameters.TLSConfig),
			server.WithH2C(true),
			server.WithALPN(true),
		)
	}

	srv := server.New(options...)

	// enable HTTP/2
	if parameters.TLSConfig != nil {
		srv.AddProtocol("h2", factory.NewServerFactory())
	}

	// the default middleware
	srv.Use(parameters.Requests.MainMiddleware)

	// base included
	srv.GET("/", parameters.Requests.Index)
	srv.HEAD("/", parameters.Requests.Ping)
	srv.GET("/ping", parameters.Requests.Ping)

	// proxies
	srv.GET("/ws", adaptor.HertzHandler(http.HandlerFunc(parameters.Requests.Websocket)))
	srv.Any("/*path", parameters.Requests.ProxyHandler)

	if IsDebug {
		pprof.Register(srv)
	}

	srv.Spin()
}
