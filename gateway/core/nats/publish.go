package nats

import (
	"context"
	"log"

	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// Sends a global message for who is listening
// global events are plain core nats pubsub, they don't need persistence
func (instance *Instance) PublishToGlobal(payload *UpstreamPayload) {
	if instance.Client == nil {
		return
	}

	err := instance.Client.PublishMsg(&nats.Msg{
		Subject: "global." + payload.Event,
		Data:    payload.Data,
		Header:  payload.Header,
	})

	if err != nil && IsDebug {
		log.Printf("NATS | failed to publish global [%s]: %v", payload.Event, err)
	}
}

// Sends a messages to a specific microservice over the upstream channel
// this gateway -> microservice
func (instance *Instance) PublishToIPC(payload *UpstreamPayload) {
	_, span := OTELNatsTracer.Start(context.Background(), "nats-pub-ipc",
		trace.WithSpanKind(trace.SpanKindProducer),
	)

	defer span.End()

	span.AddEvent("req", trace.WithAttributes(
		attribute.String("event", payload.Event),
	))

	serviceID, exist := instance.LookupServiceByEventID(payload.Event)

	if !exist {
		return
	}

	span.AddEvent("lookup", trace.WithAttributes(
		attribute.String("service_id", serviceID),
	))

	if instance.UpstreamTransformer != nil {
		instance.UpstreamTransformer(payload)
	}

	_, err := instance.Jetstream.PublishMsgAsync(&nats.Msg{
		Subject: "ipc." + serviceID,
		Data:    payload.Data,
		Header:  payload.Header,
	})

	if err != nil && IsDebug {
		// async publish can fail when the pending ack window is full
		log.Printf("NATS | failed to publish ipc [%s] to [%s]: %v", payload.Event, serviceID, err)
	}
}
