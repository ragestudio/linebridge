/**
 * Handles pong responses for heartbeat.
 *
 * @param {Object} data - Pong data.
 */
export default function (this: any, data: any) {
	this.state.lastPong = performance.now()
}
