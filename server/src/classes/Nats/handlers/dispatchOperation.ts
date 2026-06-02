import * as Serializers from "../serializers"
import type NatsAdapter from "../adapter"

export default async function dispatchOperation(
	this: NatsAdapter,
	operation: string,
	data?: any,
): Promise<any> {
	const response = await this.nats.request(
		"operations",
		Buffer.from(Serializers.Operation({ type: operation, data })),
	)

	const decoded = this.codec.decode(response.data) as any

	if (!decoded.ok) {
		throw new Error(decoded.error)
	}

	return decoded.data
}
