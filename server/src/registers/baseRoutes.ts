import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"
import type Server from "../server"
import type { Route } from "../classes/Route"

import MainBaseRoute from "../baseRoutes/main"
import MapBaseRoute from "../baseRoutes/map"

const base_routes = [MainBaseRoute, MapBaseRoute]

export default async (server: Server): Promise<void> => {
	for await (const route of base_routes) {
		server.engine.register(new (route as typeof Route<Server>)())
	}
}
