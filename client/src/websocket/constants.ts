import { version } from "../../package.json"

/** Client library version */
export const VERSION: string = version

/** Default client parameters */
export const DEFAULT_PARAMS = {
	refName: "default",
	heartbeat: true,
	autoReconnect: true,
	maxConnectRetries: Infinity,
}

/** Time for heartbeat checks in milliseconds */
export const HEARTBEAT_INTERVAL: number = 25000
/** Grace period to kill a connection that has not responded to a heartbeat in milliseconds */
export const HEARTBEAT_GRACE_PERIOD: number = 5000

/** Delay between reconnection attempts in milliseconds */
export const RECONNECT_TIMEOUT: number = 5000
/** Default timeout for RPC calls in milliseconds */
export const CALL_TIMEOUT: number = 10000
