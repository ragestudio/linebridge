const commands = [
    {
        command: "clserver",
        description: "Start an cloudlink server",
        exec: (context, args) => {
            const cloudlink = require('@ragestudio/cloudlink')

            console.log(`Starting Cloudlink™ Server \n`)
            const server = new cloudlink.Server({...args})
            server.init()
        }
    }
]

//* append commands to cli
runtime.appendToCli(commands)