import * as Serializers from "../serializers"

export default async function (operation, data) {
	let response = await this.nats.request(
		`operations`,
		Buffer.from(
			Serializers.Operation({
				type: operation,
				data: data,
			}),
		),
	)

	response = this.codec.decode(response.data)

	if (!response.ok) {
		throw new Error(response.error)
	}

	return response.data
}
