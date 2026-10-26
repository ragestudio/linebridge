package services

import (
	"maps"
)

// route as advertised by the service during registration
type Route struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

// registration snapshot sent by a service over the ipc socket
type Registration struct {
	Namespace    string   `json:"namespace"`
	Secure       bool     `json:"secure"`
	HTTPEnabled  bool     `json:"http_enabled"`
	HTTPProto    string   `json:"http_proto"`
	Paths        []string `json:"paths"`
	Routes       []Route  `json:"routes"`
	WSEnabled    bool     `json:"ws_enabled"`
	WSProto      string   `json:"ws_proto"`
	WSPath       string   `json:"ws_path"`
	WSEvents     []string `json:"ws_events"`
	IP           string   `json:"ip"`
	Port         int      `json:"port"`
	Socket       string   `json:"socket,omitempty"`
	RegisteredAt int64    `json:"registered_at"`
}

func (s *Service) SetRegistration(registration Registration) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.registration = registration
	s.registered = true
}

func (s *Service) Registration() (Registration, bool) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	return s.registration, s.registered
}

// EnvSnapshot returns a copy of the environment injected into the service
func (s *Service) EnvSnapshot() map[string]string {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	env := make(map[string]string, len(s.Env))
	maps.Copy(env, s.Env)

	return env
}
