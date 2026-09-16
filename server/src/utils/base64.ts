import { Buffer } from "node:buffer"

export function decode(data: string) {
	return Buffer.from(data, "base64").toString("utf-8")
}

export function encode(data: any) {
	return Buffer.from(data, "utf-8").toString("base64")
}

export default {
	decode,
	encode,
}
