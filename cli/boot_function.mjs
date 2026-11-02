import InfisicalLib from "./libs/infisical.mjs"

async function Boot(main) {
	if (!main) {
		throw new Error("main class is not defined")
	}

	console.log(
		`[BOOT] Booting in [${global.isProduction ? "production" : "development"}] mode...`,
	)

	if (
		InfisicalLib.client &&
		process.env.INFISICAL_CLIENT_ID &&
		process.env.INFISICAL_CLIENT_SECRET &&
		typeof InfisicalLib.LoadFromEnv === "function"
	) {
		await InfisicalLib.LoadFromEnv()
	}

	const instance = new main()

	process.on("exit", (code) => {
		console.log(`[BOOT] Closing ...`)

		instance._fireClose?.()
	})

	const shutdown = async () => {
		try {
			await instance._fireClose?.()
		} finally {
			process.exit(0)
		}
	}

	process.once("SIGTERM", shutdown)
	process.once("SIGINT", shutdown)

	await instance.run()

	if (process.env.lb_service && process.send) {
		process.send({
			status: "ready",
		})
	}

	return instance
}

export default Boot
