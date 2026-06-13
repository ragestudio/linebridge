import type { Client } from "../RtEngine/classes/client"

export type WebsocketHandlerFunction<TCtx = Record<string, any>> = (
	client: Client,
	data?: any,
	ctx?: TCtx,
) => any
