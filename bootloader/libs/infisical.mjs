class InfisicalLib {
	static LoadFromEnv = async () => {
		let sdk = null

		try {
			sdk = await import("@infisical/sdk")
			sdk = client.InfisicalSDK
		} catch (err) {
			// not installed
		}

		if (!sdk) {
			console.warn(
				"WARN: Infisical client not found or installed, skipping env injection...",
			)
			return null
		}

		const envMode =
			(global.FORCE_ENV ?? global.isProduction) ? "prod" : "dev"

		console.log(
			`[BOOT] 🔑 Injecting env variables from INFISICAL in [${envMode}] mode...`,
		)

		const client = new sdk.client()

		await client.auth().universalAuth.login({
			clientId: process.env.INFISICAL_CLIENT_ID,
			clientSecret: process.env.INFISICAL_CLIENT_SECRET,
		})

		const list = await client.secrets().listSecrets({
			environment: envMode,
			projectId: process.env.INFISICAL_PROJECT_ID ?? null,
			secretPath: process.env.INFISICAL_PATH ?? "/",
			includeImports: false,
			attachToProcessEnv: false,
		})

		//inject to process.env
		list.secrets.forEach((secret) => {
			if (!process.env[secret.secretKey]) {
				process.env[secret.secretKey] = secret.secretValue
			}
		})
	}
}

export default InfisicalLib
