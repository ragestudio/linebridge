package services

import (
	"log"
	"ultragateway/utils"

	"github.com/cloudwego/hertz/pkg/app/client"
)

func (service *Service) SetListenSocket(socket string) error {
	service.Mutex.Lock()
	defer service.Mutex.Unlock()

	service.ListenSocket = socket

	newClient, err := utils.NewUnixSocketClient(socket)

	if err != nil {
		log.Printf("Failed to create socket client for service [%s]: %v", service.ID, err)
		return err
	}

	service.SocketClient = newClient

	return nil
}

func (service *Service) GetListenSocket() string {
	service.Mutex.Lock()
	defer service.Mutex.Unlock()

	return service.ListenSocket
}

func (service *Service) GetSocketClient() *client.Client {
	service.Mutex.Lock()
	defer service.Mutex.Unlock()

	return service.SocketClient
}
