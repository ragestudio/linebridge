package websocket

import (
	"context"
	unats "ultragateway/core/nats"
	"ultragateway/structs"

	"github.com/bytedance/sonic"
	"github.com/lxzan/gws"
)

func (manager *Instance) OnClose(conn *gws.Conn, err error) {
	connCtx, removeErr := manager.Connections.Remove(conn)

	if removeErr == nil && connCtx != nil {
		if connCtx.BufReader != nil {
			manager.ReaderPool.Put(connCtx.BufReader)
		}

		if wrapper, ok := conn.NetConn().(*structs.GwsConnWrapper); ok {
			wrapper.Conn = nil
			manager.WrapperPool.Put(wrapper)
		}

		// unregister presence in Redis if enabled
		if manager.Redis != nil {
			userId := connCtx.Meta["user_id"]
			if userId != "" {
				ctxBg := context.Background()
				luaScript := `
					redis.call('SREM', 'presence:user:' .. KEYS[1], ARGV[1])
					redis.call('DEL', 'presence:sockets:' .. ARGV[1])
					if redis.call('SCARD', 'presence:user:' .. KEYS[1]) == 0 then
						redis.call('ZREM', 'presence:global_users', KEYS[1])
					end
				`
				manager.Redis.Client.Eval(ctxBg, luaScript, []string{userId}, connCtx.ID)
			}
		}

		disccEventData, _ := sonic.Marshal(connCtx)
		manager.Nats.PublishToGlobal(
			&unats.UpstreamPayload{
				Event: "disconnection",
				Data:  disccEventData,
			},
		)
	}
}
