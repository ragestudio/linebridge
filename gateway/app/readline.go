package app

import (
	"bufio"
	"os"
	"strings"
)

func (app *AppData) StartReadline() {
	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			continue
		}

		splits := strings.Split(line, " ")

		command := splits[0]

		switch command {
		case "restart":
			{
				if len(splits) < 2 || splits[1] == "" {
					os.Stderr.WriteString("usage: restart <service>\n")
					break
				}

				service := app.Services[splits[1]]

				if service == nil {
					os.Stderr.WriteString("Unknown service: " + splits[1] + "\n")
					break
				}

				service.Restart()
			}
		case "exit":
			os.Exit(0)
		default:
			os.Stderr.WriteString("Unknown command: " + command + "\n")
		}
	}
}
