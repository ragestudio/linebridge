package structs

import "crypto/ecdsa"

type PackageJSON struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ScriptConfig struct {
	Path          string `json:"path"`
	CrashIfFailed bool   `json:"crash_if_failed"`
}

type BaseConfig struct {
	Mode     string         `json:"mode"`
	Http     HttpConfig     `json:"http"`
	IPC      IPCConfig      `json:"ipc"`
	Services ServicesConfig `json:"services"`
	JWT      JWTConfig      `json:"jwt"`
	Scripts  []ScriptConfig `json:"scripts"`
}

type HttpConfig struct {
	Port         int                `json:"port"`
	SecurePort   int                `json:"secure_port"`
	Certificates CertificatesConfig `json:"certificates"`
}

type IPCConfig struct {
	Path string `json:"path"` // defines the path to start the IPC socket for services intercomunication
}

type ServicesConfig struct {
	Bootloader string `json:"bootloader"` // the linebridge bootloader file, can be optional, by default uses the builtin bootloader
}

type CertificatesConfig struct {
	Cert string `json:"cert"` // cert path
	Key  string `json:"key"`  // key path
}

type JWTConfig struct {
	Secret          string              `json:"secret"`
	PrivateKey      string              `json:"private_key"`
	PublicKey       string              `json:"public_key"`
	ECDSAPrivateKey *ecdsa.PrivateKey   `json:"ecdsa_private_key"`
	ECDSAPublicKey  *ecdsa.PublicKey    `json:"ecdsa_public_key"`
	UseKeys         []map[string]string `json:"use_keys"`
}
