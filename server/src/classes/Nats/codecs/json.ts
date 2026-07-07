import type { Codec } from "@nats-io/transport-node"

export default class JSONCodec implements Codec<any> {
	encode(data: any): Uint8Array {
		return Buffer.from(JSON.stringify(data))
	}

	decode(data: any): any {
		return JSON.parse(data)
	}
}
