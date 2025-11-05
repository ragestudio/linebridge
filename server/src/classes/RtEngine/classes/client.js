/**
 * websocket client wrapper that provides convenient methods for communication
 * handles user authentication, topic subscriptions, and message emission
 * acts as a bridge between raw websocket connections and application logic
 */
class Client {
	/**
	 * creates a new client instance from a websocket connection
	 * extracts user information and authentication status from socket context
	 * @param {Object} socket - the websocket connection object
	 * @param {Object} socket.context - connection context with user data
	 * @param {string} socket.context.id - unique connection identifier
	 * @param {Object} [socket.context.user] - authenticated user object
	 * @param {string} [socket.context.user._id] - user id
	 * @param {Object} [socket.context.session] - authentication session
	 */
	constructor(engine, socket) {
		this.engine = engine
		this.socket = socket

		// extract unique connection id from socket context
		this.id = socket.context.id

		// extract user id if user is authenticated, null otherwise
		this.userId = socket.context.user?._id || null

		// determine authentication status based on session presence
		this.authenticated = !!socket.context.session
	}

	/**
	 * sends an event message directly to this client
	 * serializes the event and data into json and sends via websocket
	 * @param {string} event - the event name to emit
	 * @param {any} data - the data payload to send
	 * @returns {any} result from socket.send operation
	 */
	emit(event, data) {
		// serialize event and data into structured json payload
		const payload = this.engine.encode({ event, data })

		// send the payload through the websocket connection
		return this.socket.send(payload)
	}

	/**
	 * publishes an event to a topic/channel for all subscribers
	 * optionally includes self in the broadcast
	 * @param {string} topic - the topic/channel to publish to
	 * @param {string} event - the event name to publish
	 * @param {any} data - the data payload to publish
	 * @param {boolean} [self=false] - whether to also send to this client
	 * @returns {void}
	 */
	toTopic(topic, event, data, self = false) {
		// create structured payload with topic, event, and data
		const payload = this.engine.encode({
			topic,
			event,
			data,
		})

		// publish the message to all topic subscribers
		this.socket.publish(topic, payload)

		// optionally send the same event directly to this client
		if (self === true) {
			this.emit(event, data)
		}
	}

	/**
	 * sends an error message to the client
	 * converts error objects to strings for transmission
	 * @param {Error|string} error - the error to send to client
	 * @returns {any} result from emit operation
	 */
	error(error) {
		// convert error objects to string representation
		if (error instanceof Error) {
			error = error.toString()
		}

		// emit the error as a standard error event
		return this.emit("error", error)
	}

	/**
	 * subscribes the client to a topic/channel
	 * notifies client of successful subscription
	 * @param {string} topic - the topic name to subscribe to
	 * @returns {any} result from socket subscription
	 */
	subscribe(topic) {
		// subscribe the underlying socket to the topic
		this.socket.subscribe(topic)

		// notify client that subscription was successful
		this.emit("topic:subscribed", topic)

		return null
	}

	/**
	 * unsubscribes the client from a topic/channel
	 * notifies client of successful unsubscription
	 * @param {string} topic - the topic name to unsubscribe from
	 * @returns {any} result from socket unsubscription
	 */
	unsubscribe(topic) {
		// unsubscribe the underlying socket from the topic
		this.socket.unsubscribe(topic)

		// notify client that unsubscription was successful
		this.emit("topic:unsubscribed", topic)

		return null
	}

	/**
	 * unsubscribes the client from all current topic subscriptions
	 * iterates through all active topics and unsubscribes from each
	 * useful for cleanup during client disconnection
	 * @returns {void}
	 */
	unsubscribeAll() {
		// iterate through all topics this socket is subscribed to
		for (const topic of this.socket.topics) {
			// unsubscribe from each topic individually
			this.unsubscribe(topic)
		}
	}
}

export default Client
