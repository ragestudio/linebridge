package websocket

import (
	"log"
	unats "ultragateway/core/nats"
)

func (context *Instance) UpstreamTransformer(payload *unats.UpstreamPayload) {
	//
	//
	log.Printf("helo from transformer")
}
