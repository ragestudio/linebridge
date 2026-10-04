export class Logger {
	prefix: string = ""

	constructor(prefix: string = "") {
		this.prefix = prefix
	}

	/** Returns the arguments prefixed with the logger tag */
	format(...args: any[]): any[] {
		if (typeof this.prefix === "string" && this.prefix.length > 0) {
			return [`[${this.prefix}]`, ...args]
		}

		return args
	}

	log(...args: any[]): void {
		console.log(...this.format(...args))
	}

	info(...args: any[]): void {
		console.info(...this.format(...args))
	}

	warn(...args: any[]): void {
		console.warn(...this.format(...args))
	}

	error(...args: any[]): void {
		console.error(...this.format(...args))
	}
}

export default Logger
