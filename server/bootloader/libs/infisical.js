const { InfisicalClient } = require("@infisical/sdk")

class InfisicalLib {
	static LoadFromEnv = async () => {
		const envMode =
			(global.FORCE_ENV ?? global.isProduction) ? "prod" : "dev"

		console.log(
			`[BOOT] 🔑 Injecting env variables from INFISICAL in [${envMode}] mode...`,
		)

		const client = new InfisicalClient({
			auth: {
				universalAuth: {
					clientId: process.env.INFISICAL_CLIENT_ID,
					clientSecret: process.env.INFISICAL_CLIENT_SECRET,
				},
			},
		})

		const secrets = await client.listSecrets({
			environment: envMode,
			path: process.env.INFISICAL_PATH ?? "/",
			projectId: process.env.INFISICAL_PROJECT_ID ?? null,
			includeImports: false,
		})

		//inject to process.env
		secrets.forEach((secret) => {
			if (!process.env[secret.secretKey]) {
				process.env[secret.secretKey] = secret.secretValue
			}
		})
	}
}

module.exports = InfisicalLib
