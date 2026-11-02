package utils

import (
	"os"
	"strings"
)

const MachineIDReadPath = "/etc/machine-id"

func ReadMachineID() (string, error) {
	data, err := os.ReadFile(MachineIDReadPath)

	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(data)), nil
}
