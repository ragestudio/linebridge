export type EventHandler = {
	event: string // the event name to listen for
	handler: Function // the function to call when the event is emitted
	once: boolean // if true, the handler will be removed after the first invocation
	ack?: boolean // defined to indicate if the handler expects an acknowledgment
	error?: any
}
