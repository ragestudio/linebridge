package jsvm

import (
	"io"
	"os"

	"github.com/dop251/goja"
)

func (instance *JSVM) RunScript(path string) (goja.Value, error) {
	file, err := os.Open(path)

	if err != nil {
		return nil, err
	}

	defer file.Close()

	data, err := io.ReadAll(file)

	if err != nil {
		return nil, err
	}

	// TODO: Use a better way to run scripts instead using strings
	res, err := instance.Runtime.RunString(string(data))

	if err != nil {
		return nil, err
	}

	return res, nil
}
