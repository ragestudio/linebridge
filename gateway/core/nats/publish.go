package nats

import (
	"context"

	"github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// Sends a global message for who is listening
func (instance *Instance) PublishToGlobal(payload *UpstreamPayload) {
	instance.Jetstream.PublishMsgAsync(
		&nats.Msg{
			Subject: "global." + payload.Event,
			Data:    payload.Data,
			Header:  payload.Header,
		},
	)
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

	if exist {
		span.AddEvent("lookup", trace.WithAttributes(
			attribute.String("service_id", serviceID),
		))

		if instance.UpstreamTransformer != nil {
			instance.UpstreamTransformer(payload)
		}

		instance.Jetstream.PublishMsgAsync(
			&nats.Msg{
				Subject: "ipc." + serviceID,
				Data:    payload.Data,
				Header:  payload.Header,
			},
		)
	}
}
