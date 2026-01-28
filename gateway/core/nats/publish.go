package nats

import (
	"log"

	"github.com/nats-io/nats.go"
)

// Sends a global message for who is listening
func (instance *Instance) PublishToGlobal(payload UpstreamPayload) {
	instance.Jetstream.PublishMsgAsync(
		&nats.Msg{
			Subject: "global",
			Data:    payload.Data,
		},
	)
}

// Sends a messages to a specific microservice over the upstream channel
// this gateway -> microservice
func (instance *Instance) PublishToIPC(payload UpstreamPayload) {
	serviceID, exist := instance.LookupServiceByEventID(payload.Event)

	if exist {
		if instance.UpstreamTransformer != nil {
			instance.UpstreamTransformer(&payload)
		}

		log.Printf("NATS | Sending [%s] event to [%s] service", payload.Event, serviceID)

		instance.Jetstream.PublishMsgAsync(
			&nats.Msg{
				Subject: "ipc." + serviceID,
				Data:    payload.Data,
				Header:  payload.Header,
			},
		)
	}
}
