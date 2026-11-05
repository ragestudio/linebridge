BUILD_DIR=bin
MAIN_FILE=main.go
PGO_FILE=default.pgo
BUILD_FLAGS=-trimpath -pgo=auto

TARGET_BINARY_NAME=$(if $(BINARY_NAME),$(BINARY_NAME),ultragateway)
INSTALL_DIR?=$(HOME)/.local/bin

# Host architecture detection (uses uname so Go is not required at install time)
TARGET_ARCH=$(if $(GOARCH),$(GOARCH),$(shell uname -m | grep -q -E "aarch64|arm64" && echo "arm64" || echo "amd64"))
TARGET_ARCH_LEVEL=$(if $(GOAMD64),$(GOAMD64),$(shell lscpu 2>/dev/null | grep -o -E "avx512" >/dev/null && echo "v4" || (lscpu 2>/dev/null | grep -o -E "avx2" >/dev/null && echo "v3" || echo "v2")))

BIN_LINUX_AMD64v1=$(BUILD_DIR)/$(TARGET_BINARY_NAME)-linux-x64
BIN_LINUX_AMD64v3=$(BUILD_DIR)/$(TARGET_BINARY_NAME)-linux-x64v3
BIN_LINUX_ARM64=$(BUILD_DIR)/$(TARGET_BINARY_NAME)-linux-arm64

# Determine the best binary candidate for this host
ifeq ($(TARGET_ARCH),arm64)
    OPTIMIZED_BIN=$(BIN_LINUX_ARM64)
else
    # On AMD64, use v3 if host supports AVX2 (v3) or AVX-512 (v4); otherwise fallback to v1
    ifneq ($(filter v3 v4,$(TARGET_ARCH_LEVEL)),)
        OPTIMIZED_BIN=$(BIN_LINUX_AMD64v3)
    else
        OPTIMIZED_BIN=$(BIN_LINUX_AMD64v1)
    endif
endif

VERSION=$(shell grep -o '"version": *"[^"]*"' package.json 2>/dev/null | cut -d'"' -f4)
BUILD_DATE=$(shell date -u +%Y-%m-%d)

LDFLAGS=-ldflags \
"-X ultragateway/app.Version=$(VERSION) \
-X ultragateway/app.BuildTime=$(BUILD_DATE) \
-s -w -extldflags '-static'"

.PHONY: clean binaries build build-linux-amd64 build-linux-amd64-v3 build-linux-arm64 install

binaries:
	@echo "Compiling binaries..."
	$(MAKE) build-linux-amd64
	$(MAKE) build-linux-amd64-v3
	$(MAKE) build-linux-arm64

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

install:
	@mkdir -p $(INSTALL_DIR)
	@SELECTED_BIN=""; \
	if [ -f "$(OPTIMIZED_BIN)" ]; then \
		SELECTED_BIN="$(OPTIMIZED_BIN)"; \
	elif [ -f "$(BUILD_DIR)/$(TARGET_BINARY_NAME)" ]; then \
		SELECTED_BIN="$(BUILD_DIR)/$(TARGET_BINARY_NAME)"; \
	elif [ -f "$(BIN_LINUX_AMD64v1)" ]; then \
		echo "Warning: Optimal binary ($(OPTIMIZED_BIN)) not found. Falling back to generic v1."; \
		SELECTED_BIN="$(BIN_LINUX_AMD64v1)"; \
	else \
		echo "Error: No compiled binary found in '$(BUILD_DIR)'." >&2; \
		echo "Please run 'make build' or 'make binaries' first." >&2; \
		exit 1; \
	fi; \
	echo "Installing $$SELECTED_BIN -> $(INSTALL_DIR)/$(TARGET_BINARY_NAME)..."; \
	cp "$$SELECTED_BIN" "$(INSTALL_DIR)/$(TARGET_BINARY_NAME)" && \
	chmod +x "$(INSTALL_DIR)/$(TARGET_BINARY_NAME)" && \
	echo "Installed successfully."

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(PGO_FILE)
