import os from "node:os"

export default function getHostAddress(): string {
	const interfaces = os.networkInterfaces()

	for (const key in interfaces) {
		const iface = interfaces[key]

		if (!iface) continue

		for (let index = 0; index < iface.length; index++) {
			const alias = iface[index]

			if (
				alias.family === "IPv4" &&
				alias.address !== "127.0.0.1" &&
				!alias.internal
			) {
				return alias.address
			}
		}
	}

	return "0.0.0.0"
}
