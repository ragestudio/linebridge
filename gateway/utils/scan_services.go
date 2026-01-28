package utils

import (
	"log"
	"os"
	"path/filepath"
	"strings"
)

// scan all available microservices by search on the current cwd
// searching for services/*.service.js
func ScanServices() []map[string]string {
	var services []map[string]string
	var scanPath string = "services/**/*.service.js"
	var pathOverride string

	if len(os.Args) > 1 {
		pathOverride = os.Args[1]
	}

	if pathOverride != "" {
		// resolve the path
		scanPath = pathOverride + "/" + scanPath
	}

	files, err := filepath.Glob(scanPath)

	if err != nil {
		return services
	}

	for _, file := range files {
		// resolve absolute path
		absPath, err := filepath.Abs(file)

		if err != nil {
			log.Println("Failed to resolve absolute path for", file, err)
			continue
		}

		basePath := filepath.Base(file)

		services = append(services, map[string]string{
			"id":   strings.Split(basePath, ".")[0],
			"path": absPath,
		})
	}

	return services
}
