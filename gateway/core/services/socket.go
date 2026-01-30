package services

import (
	"log"
	"ultragateway/utils"

	"github.com/cloudwego/hertz/pkg/app/client"
)

func (s *Service) SetListenSocket(socket string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.ListenSocket = socket

	newClient, err := utils.NewUnixSocketClient(socket)
	if err != nil {
		log.Printf("Failed to create socket client for service [%s]: %v", s.ID, err)
		return err
	}

	s.SocketClient = newClient
	return nil
}

func (s *Service) GetListenSocket() string {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.ListenSocket
}

func (s *Service) GetSocketClient() *client.Client {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.SocketClient
}
