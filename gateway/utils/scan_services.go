package utils

import (
	"log"
	"path/filepath"
	"strings"
)

// scan all available microservices by search on the current cwd
// searching for services/*.service.js and services/*.service.ts
func ScanServices(pwd string) []map[string]string {
	var services []map[string]string
	var scanPathJS string = pwd + "/services/**/*.service.js"
	var scanPathTS string = pwd + "/services/**/*.service.ts"

	// glob for js files
	filesJS, err := filepath.Glob(scanPathJS)
	if err != nil {
		return services
	}

	// glob for ts files
	filesTS, err := filepath.Glob(scanPathTS)
	if err != nil {
		return services
	}

	// combine both file lists
	files := append(filesJS, filesTS...)

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
