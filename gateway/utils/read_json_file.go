package utils

import (
	"encoding/json"
	"io"
	"os"
)

func ReadJSON(path string, v any) error {
	var file *os.File
	var data []byte
	var err error

	if file, err = os.Open(path); err != nil {
		return err
	}

	defer file.Close()

	if data, err = io.ReadAll(file); err != nil {
		return err
	}

	if err = json.Unmarshal(data, v); err != nil {
		return err
	}

	return nil
}
