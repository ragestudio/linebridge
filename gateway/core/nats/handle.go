package nats

import (
	"log"
	"time"

	"github.com/nats-io/nats.go"
)

func (instance *Instance) HandleOperations(msg *nats.Msg) {
	startTime := time.Now()

	if instance.OperationHandler == nil {
		return
	}

	instance.OperationHandler(msg)

	log.Printf("NATS | operation took %v", time.Since(startTime))
}

// Handles the messages received from the subcribed downstream channel
// microservice -> this gateway
func (instance *Instance) HandleIPC(msg *nats.Msg) {
	if instance.DownstreamHandler == nil {
		return
	}

	instance.DownstreamHandler(msg)
}
