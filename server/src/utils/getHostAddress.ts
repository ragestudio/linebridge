/**
 * @fileoverview Utility to find the first non-loopback IPv4 address
 * of the machine by scanning its network interfaces.
 *
 * Used to determine the external IP address the server should bind to.
 */

import os from "node:os"

/**
 * Iterates over all network interfaces and returns the first non-internal
 * IPv4 address found. Falls back to "0.0.0.0" if no suitable address is found.
 *
 * @returns a string IPv4 address
 */
export default function getHostAddress(): string {
	const interfaces = os.networkInterfaces()

	for (const key in interfaces) {
		const iface = interfaces[key]

		if (!iface) continue

		for (let index = 0; index < iface.length; index++) {
			const alias = iface[index]

			// skip loopback (127.0.0.1) and internal interfaces
			if (
				alias.family === "IPv4" &&
				alias.address !== "127.0.0.1" &&
				!alias.internal
			) {
				return alias.address
			}
		}
	}

	// fallback: bind to all available interfaces
	return "0.0.0.0"
}
