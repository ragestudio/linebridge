export default function serializeError(error: Error): {
	message: string
	stack?: string
	name: string
} | null {
	if (!error) return null

	return {
		message: error.message,
		stack: error.stack,
		name: error.name,
	}
}
