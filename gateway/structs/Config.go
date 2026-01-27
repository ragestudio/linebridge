package structs

type PackageJSON struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type BaseConfig struct {
	Mode     string         `json:"mode"`
	Http     HttpConfig     `json:"http"`
	IPC      IPCConfig      `json:"ipc"`
	Services ServicesConfig `json:"services"`
	JWT      JWTConfig      `json:"jwt"`
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
	Secret string `json:"secret"`
}
