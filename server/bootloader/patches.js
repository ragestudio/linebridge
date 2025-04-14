const { webcrypto: crypto } = require("node:crypto")
const { Buffer } = require("node:buffer")

global.isProduction = process.env.NODE_ENV === "production"

global.b64Decode = (data) => {
	return Buffer.from(data, "base64").toString("utf-8")
}
global.b64Encode = (data) => {
	return Buffer.from(data, "utf-8").toString("base64")
}

global.nanoid = (t = 21) =>
	crypto
		.getRandomValues(new Uint8Array(t))
		.reduce(
			(t, e) =>
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

Array.prototype.updateFromObjectKeys = function (obj) {
	this.forEach((value, index) => {
		if (obj[value] !== undefined) {
			this[index] = obj[value]
		}
	})

	return this
}

global.ToBoolean = (value) => {
	if (typeof value === "boolean") {
		return value
	}

	if (typeof value === "string") {
		return value.toLowerCase() === "true"
	}

	return false
}
