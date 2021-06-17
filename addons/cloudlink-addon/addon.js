const cloudlink = require('@ragestudio/cloudlink')

const commands = [
    {
        command: "clserver",
        description: "Start an cloudlink server",
        exec: (context, args) => {
            console.log("Starting Cloudlink™ Server")

            console.log(cloudlink)
        }
    }
]

//* append commands to cli
runtime.appendToCli(commands)