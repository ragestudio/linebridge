BINARY_NAME=ultragateway
MAIN_FILE=main.go
PGO_FILE=default.pgo
LDFLAGS=-ldflags "-s -w -extldflags '-static'"
ARCH_LEVEL=v3
BUILD_FLAGS=-trimpath -pgo=auto

all: build

build:
	@echo "Compiling project (GOAMD64=$(ARCH_LEVEL))..."
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=$(ARCH_LEVEL) \
	go build $(BUILD_FLAGS) $(LDFLAGS) -o $(BINARY_NAME) $(MAIN_FILE)
	@echo "Done:"
	@du -h $(BINARY_NAME)

clean:
	rm -f $(BINARY_NAME) $(PGO_FILE)
