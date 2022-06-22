const InternalConsole = require("../internalConsole")

function outputServerError({
    message = "Unexpected error",
    description,
    ref = "SERVER",
}) {
    InternalConsole.error(`\n\x1b[41m\x1b[37m🆘 [${ref}] ${message}\x1b[0m ${description ? `\n ${description}` : ""} \n`)
}

module.exports = outputServerError