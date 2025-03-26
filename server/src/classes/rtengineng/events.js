import { performance } from "node:perf_hooks"

export default {
	"server:ping": async (client, data) => {
		const pongTime = performance.now()

		return {
			ping: data.ping ?? 0,
			pong: pongTime,
			latency: Number(pongTime - data.ping),
			latencyMs: Number(pongTime - data.ping).toFixed(2),
		}
	},
	"topic:subscribe": async (client, topic) => {
		client.subscribe(topic)
	},
	"topic:unsubscribe": async (client, topic) => {
		client.unsubscribe(topic)
	},
}
