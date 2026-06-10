export interface Request {
	url: string
	path: string
	method: string

	cookies: string
	ip: string

	headers: Record<string, any>

	ctx: Record<string, any>
	body: Record<string, any>
	params: Record<string, any>
	query: Record<string, any>

	raw: any
	buffer: () => Promise<Buffer>
	text: () => Promise<string>
	json: () => Promise<Record<any, any>>
	urlencoded: () => Promise<Record<any, any>>
}

export interface Response {
	end: (data?: any) => this
	send: (data?: any) => this
	json: (data: any) => void

	completed: boolean
	status: (code: number) => Response
	_status_code?: number

	header: (
		name: string,
		value: string | string[],
		overwrite?: boolean,
	) => this
	setHeader: (key: string, value: string) => this
}

export type HttpHandlerFunction<
	TCtx = Record<string, any>,
	TReq extends Request = Request,
	TRes extends Response = Response,
> = (req: TReq, res: TRes, ctx: TCtx) => any
