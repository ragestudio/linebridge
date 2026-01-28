package config

import (
	"os"
	"ultragateway/structs"
	"ultragateway/utils"
)

type ConfigManager struct {
	Config *structs.BaseConfig
}

var CWDOverride string = os.Getenv("CWD")

func (manager *ConfigManager) ReadConfig() (*structs.BaseConfig, error) {
	var obj structs.BaseConfig
	var path string = "gateway.config.json"

	if CWDOverride != "" {
		// resolve the path
		path = CWDOverride + "/" + path
	}

	if err := utils.ReadJSON(path, &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}

func (manager *ConfigManager) ReadPackageJson() (*structs.PackageJSON, error) {
	var obj structs.PackageJSON
	var path string = "package.json"

	if CWDOverride != "" {
		// resolve the path
		path = CWDOverride + "/" + path
	}

	if err := utils.ReadJSON(path, &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}
