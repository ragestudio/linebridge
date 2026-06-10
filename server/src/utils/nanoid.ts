/**
 * @fileoverview Generates a random ID string using the Web Crypto API,
 * similar to nanoid but without external dependencies.
 *
 * The generated ID uses a URL-safe alphabet (a-z, A-Z, 0-9, - and _)
 * with a configurable length (default 21 characters).
 */

import { webcrypto as crypto } from "node:crypto"

/**
 * Generates a nanoID-style random string of the specified length.
 *
 * Uses crypto.getRandomValues to produce cryptographically random bytes,
 * then maps each byte to a URL-safe character.
 *
 * @param t - desired length of the generated string (default 21)
 * @returns a random URL-safe string
 */
export default (t: number = 21): string =>
	crypto.getRandomValues(new Uint8Array(t)).reduce(
		(t: string, e: number) =>
			// map each random byte (0-255) to a character:
			// 0-9   -> digits     (0-9)
			// 10-35 -> lowercase  (a-z)
			// 36-61 -> uppercase  (A-Z)
			// 62    -> underscore (_)
			// 63    -> hyphen     (-)
			(t +=
				(e &= 63) < 36
					? e.toString(36) // 0-9 or a-z
					: e < 62
						? (e - 26).toString(36).toUpperCase() // A-Z
						: e > 62
							? "-"
							: "_"),
		"",
	)
