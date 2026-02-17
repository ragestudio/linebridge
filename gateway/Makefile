BUILD_DIR=bin
MAIN_FILE=main.go
PGO_FILE=default.pgo
BUILD_FLAGS=-trimpath -pgo=auto

TARGET_BINARY_NAME=$(if $(BINARY_NAME),$(BINARY_NAME),ultragateway)

TARGET_ARCH=$(if $(GOARCH),$(GOARCH),$(shell go version | grep -q "arm64" && echo "arm64" || echo "amd64"))
TARGET_ARCH_LEVEL=$(if $(GOAMD64),$(GOAMD64),$(shell lscpu 2>/dev/null | grep -o -E "avx512" >/dev/null && echo "v4" || (lscpu 2>/dev/null | grep -o -E "avx2" >/dev/null && echo "v3" || echo "v2")))

BIN_LINUX_AMD64v1=$(BUILD_DIR)/$(TARGET_BINARY_NAME)_linux_x86_64
BIN_LINUX_AMD64v3=$(BUILD_DIR)/$(TARGET_BINARY_NAME)_linux_v3_x86_64
BIN_LINUX_ARM64=$(BUILD_DIR)/$(TARGET_BINARY_NAME)_linux_aarch64

VERSION=$(shell grep -o '"version": *"[^"]*"' package.json | cut -d'"' -f4)
BUILD_DATE=$(shell date -u +%Y-%m-%d)

LDFLAGS=-ldflags \
"-X ultragateway/app.Version=$(VERSION) \
-X ultragateway/app.BuildTime=$(BUILD_DATE) \
-s -w -extldflags '-static'"

.PHONY: clean

binaries:
	@echo "Compiling binaries..."
	make build-linux-amd64
	make build-linux-amd64-v3
	make build-linux-arm64

build-linux-amd64:
	@echo "Building for Linux AMD64 v1"

	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1 \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BIN_LINUX_AMD64v1) $(MAIN_FILE)

	@du -h $(BIN_LINUX_AMD64v1)

build-linux-amd64-v3:
	@echo "Building for Linux AMD64 v3"

	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v3 \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BIN_LINUX_AMD64v3) $(MAIN_FILE)

	@du -h $(BIN_LINUX_AMD64v3)

build-linux-arm64:
	@echo "Building for Linux AARCH64"

	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BIN_LINUX_ARM64) $(MAIN_FILE)

	@du -h $(BIN_LINUX_ARM64)

build:
	@echo "Building for current platform $(TARGET_ARCH) $(TARGET_ARCH_LEVEL)"

	CGO_ENABLED=0 GOOS=linux GOARCH=$(TARGET_ARCH) GOAMD64=$(TARGET_ARCH_LEVEL) \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(TARGET_BINARY_NAME) $(MAIN_FILE)

	@du -h $(BUILD_DIR)/$(TARGET_BINARY_NAME)

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(PGO_FILE)
