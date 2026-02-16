const InfisicalLib = require("./libs/infisical")

module.exports = async function Boot(main) {
	if (!main) {
		throw new Error("main class is not defined")
	}

	console.log(
		`[BOOT] Booting in [${global.isProduction ? "production" : "development"}] mode...`,
	)

	if (
		process.env.INFISICAL_CLIENT_ID &&
		process.env.INFISICAL_CLIENT_SECRET &&
		typeof InfisicalLib.LoadFromEnv === "function"
	) {
		console.log(
			`[BOOT] INFISICAL Credentials found, loading ENV variables from INFISICAL...`,
		)
		await InfisicalLib.LoadFromEnv()
	}

	const instance = new main()

	process.on("exit", (code) => {
		console.log(`[BOOT] Closing ...`)

		instance._fireClose()
	})

	process.on("SIGTERM", () => {
		process.exit(0)
	})

	process.on("SIGINT", () => {
		process.exit(0)
	})

	await instance.run()

	if (process.env.lb_service && process.send) {
		process.send({
			status: "ready",
		})
	}

	return instance
}
