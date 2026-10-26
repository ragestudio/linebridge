package app

import (
	"bufio"
	"os"
	"strings"
	"syscall"
)

// requestGracefulShutdown starts the normal drain and stop sequence
func requestGracefulShutdown() {
	_ = syscall.Kill(os.Getpid(), syscall.SIGTERM)
}

func (app *App) StartReadline() {
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
		case "exit", "shutdown":
			os.Stderr.WriteString("shutting down gateway\n")
			requestGracefulShutdown()
		case "force":
			os.Stderr.WriteString("forcing gateway shutdown\n")
			app.RequestForceShutdown("console command")
			requestGracefulShutdown()
		default:
			os.Stderr.WriteString("Unknown command: " + command + "\n")
		}
	}
}
