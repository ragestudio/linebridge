export default {
	ping: async (client, data) => {
		client.emit("pong")
	},
	"topic:unsubscribe": async (client, topic) => {
		client.unsubscribe(topic)
	},
}
