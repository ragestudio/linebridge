import type IPC from "./index"

import { nats } from "../../lazyNats"

export default async function (
	this: IPC,
	targetServiceID: string,
	command: string,
	payload = {},
) {
	if (!this.nats) {
		return null
	}

	const reqHeaders = nats!.headers()
	reqHeaders.set("event", command)

	const res = await this.nats.request(
		`ipc_internal.${targetServiceID}`,
		this.codec.encode(payload),
		{
			headers: reqHeaders,
			timeout: 50000,
		},
	)

	if (!res) {
		throw new Error("No response received")
	}

	if (!res.data) {
		throw new Error("No data received")
	}

	const response = this.codec.decode(res.data) as {
		error?: string
		data?: any
	}

	if (response.error) {
		throw new Error(response.error)
	}

	return response.data
}
