/**
 * @fileoverview Internal engine registry mapping engine names to their implementations.
 * This is the entry point that the server uses to look up engine adaptors by name.
 */

import neo from "./neo"

const Engines: Record<string, any> = {
	neo: neo,
}

export default Engines
