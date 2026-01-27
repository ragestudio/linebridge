package utils

import (
	"net"

	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/cloudwego/hertz/pkg/network"
	"github.com/cloudwego/netpoll"
)

func NewUnixSocketClient(socketPath string) (*client.Client, error) {
	return client.NewClient(
		client.WithDialFunc(func(addr string) (network.Conn, error) {
			uad := &net.UnixAddr{
				Name: socketPath,
			}

			unixAddr := &netpoll.UnixAddr{
				*uad,
			}

			conn, err := netpoll.DialUnix(
				"unix",
				nil,
				unixAddr,
			)

			if err != nil {
				return nil, err
			}

			return conn, nil
		}),

		client.WithMaxConnsPerHost(10000),
		client.WithKeepAlive(true),
	)
}
