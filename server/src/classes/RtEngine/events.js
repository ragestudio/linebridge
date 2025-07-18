export default {
	ping: async (client, data) => {
		client.emit("pong")
	},
	"topic:subscribe": async (client, topic) => {
		client.subscribe(topic)
	},
	"topic:unsubscribe": async (client, topic) => {
		client.unsubscribe(topic)
	},
}
