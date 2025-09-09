export default {
	ping: async (client, data) => {
		client.emit("pong")
	},
}
