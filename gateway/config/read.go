package config

import (
	"os"
	"ultragateway/structs"
	"ultragateway/utils"
)

type ConfigManager struct {
	Config *structs.BaseConfig
}

func (manager *ConfigManager) ReadConfig() (*structs.BaseConfig, error) {
	var obj structs.BaseConfig
	var path string = "gateway.config.json"
	var pathOverride string

	if len(os.Args) > 1 {
		pathOverride = os.Args[1]
	}

	if pathOverride != "" {
		// resolve the path
		path = pathOverride + "/" + path
	}

	if err := utils.ReadJSON(path, &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}

func (manager *ConfigManager) ReadPackageJson() (*structs.PackageJSON, error) {
	var obj structs.PackageJSON
	var path string = "package.json"
	var pathOverride string

	if len(os.Args) > 1 {
		pathOverride = os.Args[1]
	}

	if pathOverride != "" {
		// resolve the path
		path = pathOverride + "/" + path
	}

	if err := utils.ReadJSON(path, &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}
