# Installation

## Requirements

- **Linux** or **macOS** (Unix domain sockets)
- **x86_64** or **aarch64** CPU
- **Node.js >= 24** (for Linebridge services)
- **npm** (for installing the Linebridge framework)

## Automatic Installation

```bash
curl -fsSL https://git.ragestudio.net/RageStudio/linebridge-gateway/raw/branch/main/install.sh | sudo sh
```

The installer:
1. Detects your CPU architecture (`x86_64`, `x86_64-v3` with AVX2, or `aarch64`)
2. Downloads the matching prebuilt binary from the latest release
3. Installs it to `/usr/local/bin/ultragateway`

## Manual Download

Binaries are published at:

```
https://git.ragestudio.net/RageStudio/linebridge-gateway/releases/download/latest/
```

Available variants:

| File | Architecture | Notes |
|------|-------------|-------|
| `ultragateway_linux_x86_64` | x86_64 (v1) | Baseline, works everywhere |
| `ultragateway_linux_v3_x86_64` | x86_64 (v3) | Requires AVX2 support |
| `ultragateway_linux_aarch64` | ARM64 | For Apple Silicon, AWS Graviton, etc. |

## Project Setup

A gateway project needs at minimum:

```
my-project/
├── gateway.config.json     # Gateway configuration
├── package.json            # Project metadata
├── services/               # Linebridge services
│   ├── api/
│   │   └── index.ts
│   └── chat/
│       └── index.ts
└── node_modules/
    └── linebridge/         # Provides the bootloader
```

### Dependencies

```bash
cd my-project
npm install linebridge
```

The gateway auto-discovers the bootloader at `node_modules/linebridge/bootloader/bin`. No additional Node.js tooling is needed — the gateway spawns each service's bootloader as a child process.

## Starting

```bash
# From project root
ultragateway .

# Or specify a path
ultragateway /path/to/project

# Debug mode
DEBUG=true ultragateway .
```

## CLI Commands

When the gateway is running, you can use these commands in the terminal:

| Command | Description |
|---------|------------|
| `restart <service>` | Hot-reload a specific service |
| `exit` | Gracefully shutdown the gateway |

## Verification

```bash
# Check the root endpoint
curl http://localhost:3000/

# Response includes gateway metadata:
# {
#   "gateway": "lb-ultrawg",
#   "lb_version": "exp-...",
#   "uptime": "...",
#   "sys_info": { "os": "linux", "arch": "amd64", ... }
# }
```
