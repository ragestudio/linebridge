package nats

import (
	"context"
	"log"

	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func (instance *Instance) HandleOperations(msg *nats.Msg) {
	if instance.OperationHandler == nil {
		return
	}

	// handlers run on nats goroutines, a panic there would kill the process
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("NATS | operation handler panic: %v", recovered)
		}
	}()

	_, span := OTELNatsTracer.Start(context.Background(), "nats-op-handle",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()

	span.AddEvent("req", trace.WithAttributes(
		attribute.String("subject", msg.Subject),
	))

	instance.OperationHandler(msg)
}

// Handles the messages received from the subcribed downstream channel
// microservice -> this gateway
func (instance *Instance) HandleIPC(msg *nats.Msg) {
	if instance.DownstreamHandler == nil {
		return
	}

	// handlers run on nats goroutines, a panic there would kill the process
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("NATS | downstream handler panic: %v", recovered)
		}
	}()

	_, span := OTELNatsTracer.Start(context.Background(), "nats-ipc-handle",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()

	span.AddEvent("req", trace.WithAttributes(
		attribute.String("subject", msg.Subject),
	))

	instance.DownstreamHandler(msg)
}
