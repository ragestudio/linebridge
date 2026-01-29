package internal_events

import (
	"sync"
)

type InternalEvents struct {
	Handlers *sync.Map
}

type Handler func(any)

func (events *InternalEvents) RegisterHandler(event string, callback Handler) {
	events.Handlers.Store(event, callback)
}

func (events *InternalEvents) Trigger(event string, data any) {
	if handler, ok := events.Handlers.Load(event); ok {
		handler.(Handler)(data)
	}
}
