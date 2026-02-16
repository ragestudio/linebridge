package http

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"
	"ultragateway/requests"
	"ultragateway/structs"

	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/adaptor"
	"github.com/cloudwego/hertz/pkg/common/config"
	"github.com/hertz-contrib/http2/factory"
	"github.com/hertz-contrib/pprof"
)

var IsDebug = os.Getenv("DEBUG") == "true"

type CreateEngineOptions struct {
	WaitGroup    *sync.WaitGroup
	Requests     *requests.Requests
	CustomRoutes []structs.CustomRoute
	TLSConfig    *tls.Config
	ListenPort   int
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

	if len(parameters.CustomRoutes) > 0 {
		for _, route := range parameters.CustomRoutes {
			// parse target URL to configure client properly
			targetURL, err := url.Parse(route.Target)
			if err != nil {
				log.Printf("Failed to parse target URL %s: %v", route.Target, err)
				continue
			}

			// configure TLS if target is HTTPS
			var tlsConfig *tls.Config
			if targetURL.Scheme == "https" {
				tlsConfig = &tls.Config{
					InsecureSkipVerify: true, // allow self-signed certs for now
				}
			}

			hzClient, err := client.NewClient(
				client.WithDialTimeout(time.Second*10),
				client.WithMaxConnsPerHost(100),
				client.WithKeepAlive(true),
				client.WithTLSConfig(tlsConfig),
			)

			if err != nil {
				log.Printf("Failed to create client for route %s: %v", route.Path, err)
				continue
			}

			log.Printf("Custom route: %s -> %s", route.Path, route.Target)

			handler := &CustomRouteHandler{Route: route, Client: hzClient}
			srv.Any(route.Path, handler.exec)
		}
	}

	if IsDebug {
		pprof.Register(srv)
	}

	srv.Spin()
}
