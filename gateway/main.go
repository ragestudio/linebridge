package main

import (
	"ultragateway/app"

	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	app.Start()
}
