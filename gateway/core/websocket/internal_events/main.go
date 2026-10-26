package internal_events

import (
	"log"
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
	handler, ok := events.Handlers.Load(event)

	if !ok {
		return
	}

	fn, ok := handler.(Handler)

	if !ok {
		return
	}

	// handlers are user provided scripts, an error there must not
	// break the connection lifecycle
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("internal event [%s] handler panic: %v", event, recovered)
		}
	}()

	fn(data)
}
