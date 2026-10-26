package services

import (
	"fmt"
	"time"
)

// Snapshot is a point in time view of a service, safe to serialize
type Snapshot struct {
	ID        string `json:"id"`
	Running   bool   `json:"running"`
	Pid       int    `json:"pid"`
	StartedAt int64  `json:"started_at"`
	Uptime    int64  `json:"uptime"`
	Starts    int    `json:"starts"`
	MainPath  string `json:"main_path"`
	Cwd       string `json:"cwd"`
	Socket    string `json:"socket,omitempty"`
	Watcher   bool   `json:"watcher"`
}

func (s *Service) IsRunning() bool {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	return s.Running
}

func (s *Service) Pid() int {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Cmd == nil || s.Cmd.Process == nil {
		return 0
	}

	return s.Cmd.Process.Pid
}

func (s *Service) Snapshot() Snapshot {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	snapshot := Snapshot{
		ID:       s.ID,
		Running:  s.Running,
		Starts:   s.starts,
		MainPath: s.MainPath,
		Cwd:      s.Cwd,
		Socket:   s.ListenSocket,
		Watcher:  s.Watcher != nil,
	}

	if s.Cmd != nil && s.Cmd.Process != nil {
		snapshot.Pid = s.Cmd.Process.Pid
	}

	if !s.startedAt.IsZero() {
		snapshot.StartedAt = s.startedAt.Unix()

		if s.Running {
			snapshot.Uptime = int64(time.Since(s.startedAt).Seconds())
		}
	}

	return snapshot
}

// logSystem writes a lifecycle line to the log hub
func (s *Service) logSystem(format string, args ...any) {
	if s.Logs == nil {
		return
	}

	s.Logs.Write("service:"+s.ID, "system", fmt.Sprintf(format, args...))
}
