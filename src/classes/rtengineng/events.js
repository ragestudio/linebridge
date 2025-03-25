export default {
	"topic:join": async (client, topic) => {
		client.subscribe(topic)
	},
	"topic:leave": async (client, topic) => {
		client.unsubscribe(topic)
	},
}
