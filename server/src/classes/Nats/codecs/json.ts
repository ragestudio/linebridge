import type { Codec } from "@nats-io/transport-node"

const textDecoder = new TextDecoder()

export default class JSONCodec implements Codec<any> {
	encode(data: any): Uint8Array {
		return Buffer.from(JSON.stringify(data))
	}

	decode(data: any): any {
		if (data instanceof Uint8Array) {
			data = textDecoder.decode(data)
		}

		return JSON.parse(data)
	}
}
