package main

import (
	"log"
	"os"
	"ultragateway/app"

	"github.com/joho/godotenv"
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "-v" || os.Args[1] == "--version") {
		println(app.VersionString)
		return
	}

	if len(os.Args) > 1 {
		overridedEnv := os.Args[1] + "/.env"

		err := godotenv.Load(overridedEnv)

		if err != nil {
			log.Print(err)
		}
	} else {
		godotenv.Load()
	}

	app.Start()
}
