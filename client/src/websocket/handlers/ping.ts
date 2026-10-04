import type RTEClient from ".."

export default function (this: RTEClient, data: any) {
	// update the last ping time
	this.state.lastPing = performance.now()

	this.heartbeat()
}
