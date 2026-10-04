/** Encodes a payload to JSON string */
export function encode(payload: any): string {
	return JSON.stringify(payload)
}

/** Decodes a JSON string into an object */
export function decode(payload: string): any {
	return JSON.parse(payload)
}
