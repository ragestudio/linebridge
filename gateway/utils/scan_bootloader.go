package utils

import (
	"fmt"
	"os"
	"path/filepath"
)

var BootloaderLocations = []string{
	"node_modules/linebridge/bootloader/bin",  // for linebridge 1.0 and =< 2.0
	"node_modules/@linebridge/bootloader/bin", // support for linebridge boot >=2.0 or linbridge >=2.0
	"node_modules/@linebridge/cli/bin-boot",   // support for linebridge cli >=3.0 or linebridge >=2.0
}

func ScanBootloaderLocation() (string, error) {
	pwd := Pwd()

	for _, path := range BootloaderLocations {
		absPath, err := filepath.Abs(filepath.Join(pwd, path))

		if err != nil {
			continue
		}

		_, err = os.Stat(absPath)

		if err == nil {
			return absPath, nil
		}
	}

	return "", fmt.Errorf("no bootloader location found")
}
