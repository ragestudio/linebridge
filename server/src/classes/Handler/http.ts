export interface Request {
	url: string
	method: string
	path: string
	cookies: string
	ip: string
	headers: Record<string, any>
	body: Record<string, any>
	params: Record<string, any>
	query: Record<string, any>
	ctx: Record<string, any>
	raw: any
	text: () => Promise<string>
	json: () => Promise<Record<any, any>>
	urlencoded: () => Promise<Record<any, any>>
	[key: string]: any
}

export interface Response {
	end: (data?: any) => this
	send: (data?: any) => this
	json: (data: any) => void
	status: (code: number) => Response
	header: (
		name: string,
		value: string | string[],
		overwrite?: boolean,
	) => this
	setHeader: (key: string, value: string) => this
	completed: boolean
	_status_code?: number
	_responseTimeMs?: number
}

export type HttpHandlerFunction<TCtx = Record<string, any>> = (
	req: Request & { [key: string]: any },
	res: Response,
	ctx: TCtx,
) => any
