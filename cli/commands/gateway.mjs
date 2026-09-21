import { command } from "cleye"
import { spawn } from "node:child_process"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

import searchBinary from "../utils/search_binary.mjs"
import installGateway from "../utils/install_gateway.mjs"

async function ttyConfirm(str) {
	const rl = readline.createInterface({ input, output })

	try {
		const res = await rl.question(`${str} [y/N]: `)
		const resString = res.trim().toLowerCase()

		return resString === "y" || resString === "yes"
	} finally {
		rl.close()
	}
}

export async function gatewayExec(gatewayBin, argv) {
	const child = spawn(gatewayBin, {
		stdio: "inherit",
		shell: false,
	})

	child.on("error", (error) => {
		console.error("Gateway error:", error.message)
	})

	child.on("close", (code) => {
		if (code !== 0) {
			console.log(`Gateway exited with [${code}]`)
		}
		process.exit(code)
	})
}

export async function exec(argv) {
	let gatewayBin = null

	if (argv.flags.install) {
		console.log(
			await installGateway({
				force: argv.flags.force,
			}),
		)
		process.exit(0)
	}

	// search on usr bin path
	gatewayBin = await searchBinary("ultragateway")

	// if no gateway in the system
	if (!gatewayBin) {
		try {
			// prompt to user if is available a tty
			if (
				!argv.flags["no-interactive"] &&
				!process.stdin.isTTY &&
				!process.stdout.isTTY
			) {
				throw new Error("Gateway is not installed.")
			}

			if (!argv.flags["no-interactive"]) {
				if (
					!(await ttyConfirm(
						"Gateway is not installed. Do you want to install it?",
					))
				) {
					throw new Error("Cancelled by user")
				}
			}

			gatewayBin = await installGateway({
				force: argv.flags.force,
			})
		} catch (err) {
			console.error("\n❌ Failed to install gateway binary:", err.message)
			process.exit(1)
		}
	}

	console.log("GatewayBinary:", gatewayBin)
	await gatewayExec(gatewayBin, argv)
}

export default command(
	{
		name: "gateway",
		description: "Start project in Gateway mode (microservices)",
		flags: {
			install: {
				type: Boolean,
				default: false,
				description:
					"Only download & install the latest gateway binary into your system",
			},
			force: {
				type: Boolean,
				default: false,
			},
			"no-interactive": {
				type: Boolean,
				default: false,
				description: "Set this to true if there is no current TTY",
			},
		},
	},
	exec,
)
