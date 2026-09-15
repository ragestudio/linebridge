import type * as natsType from "@nats-io/transport-node"
import type * as jetstreamType from "@nats-io/jetstream"

export let nats: typeof natsType | null = null
export let jetstream: typeof jetstreamType.jetstream | null = null
export let jetstreamManager: typeof jetstreamType.jetstreamManager | null = null

export async function loadLibs() {
	nats = await import("@nats-io/transport-node")
	jetstream = (await import("@nats-io/jetstream")).jetstream
	jetstreamManager = (await import("@nats-io/jetstream")).jetstreamManager

	return { nats, jetstream, jetstreamManager }
}
