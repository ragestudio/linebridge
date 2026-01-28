package nats_operations

import (
	"ultragateway/structs"

	"github.com/lxzan/event_emitter"
	"github.com/lxzan/gws"
)

type PubSubSubscriber struct {
	*gws.Conn
}

func NewSubscriber(conn *gws.Conn) *PubSubSubscriber {
	return &PubSubSubscriber{
		Conn: conn,
	}
}

func (context *PubSubSubscriber) GetSubscriberID() string {
	val, _ := context.Session().Load(structs.WSCtxStoreKey)

	connCtx := val.(*structs.WSConnectionCtx)

	return connCtx.ID
}

func (context *PubSubSubscriber) GetMetadata() event_emitter.Metadata {
	return context.Session()
}
