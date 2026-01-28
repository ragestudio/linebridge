BUILD_DIR=dist
BINARY_NAME=ultragateway
MAIN_FILE=main.go
PGO_FILE=default.pgo
BUILD_FLAGS=-trimpath -pgo=auto

ARCH_LEVEL=$(shell lscpu 2>/dev/null | grep -o -E "avx512" >/dev/null && echo "v4" || (lscpu 2>/dev/null | grep -o -E "avx2" >/dev/null && echo "v3" || echo "v2"))
ARCH=$(shell go version | grep -q "arm64" && echo "arm64" || echo "amd64")

VERSION=$(shell grep -o '"version": *"[^"]*"' package.json | cut -d'"' -f4)
BUILD_DATE=$(shell date -u +%Y-%m-%d)

LDFLAGS=-ldflags \
"-X ultragateway/app.Version=$(VERSION) \
-X ultragateway/app.BuildTime=$(BUILD_DATE) \
-s -w -extldflags '-static'"

.PHONY: all clean

all: build

build:
	@echo "Compiling project (GOARCH=$(ARCH) GOAMD64=$(ARCH_LEVEL))..."

	CGO_ENABLED=0 GOOS=linux GOARCH=$(ARCH) GOAMD64=$(ARCH_LEVEL) \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_FILE)

	@du -h $(BUILD_DIR)/$(BINARY_NAME)

clean:
	rm -rf $(BUILD_DIR)
	rm -f $(PGO_FILE)
