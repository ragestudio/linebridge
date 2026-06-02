import { webcrypto as crypto } from "node:crypto"

export default (t: number = 21): string =>
	crypto
		.getRandomValues(new Uint8Array(t))
		.reduce(
			(t: string, e: number) =>
				(t +=
					(e &= 63) < 36
						? e.toString(36)
						: e < 62
							? (e - 26).toString(36).toUpperCase()
							: e > 62
								? "-"
								: "_"),
			"",
		)
