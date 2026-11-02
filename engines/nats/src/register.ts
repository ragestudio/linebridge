import { registerEngine } from "linebridge/engines"
import { NatsEngine } from "./engine"

registerEngine("nats", NatsEngine)

export * from "./index"
