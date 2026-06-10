class InfisicalLib {
	static get client() {
		try {
			const mod = require("@infisical/sdk")

			return mod.InfisicalSDK
		} catch (e) {
			return null
		}
	}

	static LoadFromEnv = async () => {
		if (!InfisicalLib.client) {
			return null
		}

		const envMode =
			(global.FORCE_ENV ?? global.isProduction) ? "prod" : "dev"

		console.log(
			`[BOOT] 🔑 Injecting env variables from INFISICAL in [${envMode}] mode...`,
		)

		const client = new InfisicalLib.client()

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

module.exports = InfisicalLib
