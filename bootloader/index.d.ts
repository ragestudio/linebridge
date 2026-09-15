import BootFN from "./boot_function.cjs"

declare function Boot(server: any): Promise<void>

declare global {
	var Boot: Boot
}

export default Boot
