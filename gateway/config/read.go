package config

import (
	"path/filepath"
	"ultragateway/structs"
	"ultragateway/utils"
)

type ConfigManager struct {
	Config *structs.BaseConfig
	Pwd    string
}

func (manager *ConfigManager) GetAbsPath(item string) string {
	return filepath.Join(manager.Pwd, item)
}

func (manager *ConfigManager) ReadConfig() (*structs.BaseConfig, error) {
	var obj structs.BaseConfig

	if err := utils.ReadJSON(manager.GetAbsPath("gateway.config.json"), &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}

func (manager *ConfigManager) ReadPackageJson() (*structs.PackageJSON, error) {
	var obj structs.PackageJSON

	if err := utils.ReadJSON(manager.GetAbsPath("package.json"), &obj); err != nil {
		return nil, err
	}

	return &obj, nil
}
