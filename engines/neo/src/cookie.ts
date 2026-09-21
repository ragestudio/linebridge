import * as crypto from "node:crypto"

export function sign(value: string, secret: string): string {
	const mac = crypto
		.createHmac("sha256", secret)
		.update(value)
		.digest("base64")
		.replace(/=+$/, "")

	return `${value}.${mac}`
}

export function unsign(
	signed_value: string,
	secret: string,
): string | undefined {
	const lastDot = signed_value.lastIndexOf(".")
	if (lastDot === -1) return undefined

	const value = signed_value.slice(0, lastDot)
	const expectedSignature = sign(value, secret)

	const expectedBuffer = Buffer.from(expectedSignature)
	const providedBuffer = Buffer.from(signed_value)

	if (
		expectedBuffer.length === providedBuffer.length &&
		crypto.timingSafeEqual(expectedBuffer, providedBuffer)
	) {
		return value
	}

	return undefined
}
