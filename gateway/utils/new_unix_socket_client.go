package utils

import (
	"net"
	"time"

	"github.com/cloudwego/hertz/pkg/app/client"
	"github.com/cloudwego/hertz/pkg/network"
	"github.com/cloudwego/netpoll"
)

func NewUnixSocketClient(socketPath string) (*client.Client, error) {
	return client.NewClient(
		client.WithKeepAlive(true),
		client.WithDialTimeout(5*time.Second),
		client.WithClientReadTimeout(30*time.Second),
		client.WithWriteTimeout(30*time.Second),
		client.WithMaxIdleConnDuration(5*time.Second),
		//client.WithMaxConnsPerHost(2),
		client.WithDialFunc(func(addr string) (network.Conn, error) {
			unixAddr := &net.UnixAddr{
				Name: socketPath,
			}

			conn, err := netpoll.DialUnix(
				"unix",
				nil,
				&netpoll.UnixAddr{
					*unixAddr,
				},
			)

			if err != nil {
				return nil, err
			}

			return conn, nil
		}),
	)
}
