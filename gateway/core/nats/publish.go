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
	nodeID := instance.NodeID

	// no local handler, try the cluster wide registry
	if !exist {
		entry, remote := instance.LookupRemoteServiceByEventID(payload.Event)

		if !remote {
			instance.logMissingEvent(payload.Event)
			return
		}

		serviceID = entry.Service
		nodeID = entry.Node
	}

	span.AddEvent("lookup", trace.WithAttributes(
		attribute.String("service_id", serviceID),
		attribute.String("node_id", nodeID),
	))

	if instance.UpstreamTransformer != nil {
		instance.UpstreamTransformer(payload)
	}

	// events stay on the node that owns the socket, so handlers see the
	// same process state for the whole session
	subject := "ipc." + serviceID

	if nodeID != "" {
		subject = "ipc." + nodeID + "." + serviceID
	}

	_, err := instance.Jetstream.PublishMsgAsync(&nats.Msg{
		Subject: subject,
		Data:    payload.Data,
		Header:  payload.Header,
	})

	if err != nil && IsDebug {
		// async publish can fail when the pending ack window is full
		log.Printf("NATS | failed to publish ipc [%s] to [%s]: %v", payload.Event, serviceID, err)
	}
}
