#!/bin/bash
set -euo pipefail

LIBS_PATH=$(pwd)/libs
BUILD_PATH=$(pwd)/build
NODE_VERSION=$(node -v)
NODE_GYP_BIN=./node_modules/.bin/node-gyp

# check if not exists "libs"
if [ ! -d "$LIBS_PATH" ]; then
    # create them
    mkdir -p "$LIBS_PATH"
fi

# check if v8 fast api call header file is fetched
if [ ! -f "$LIBS_PATH/v8-fast-api-calls.h" ]; then
    # fetch it
    printf "Downloading v8-fast-api-calls.h"
    curl -fL "https://raw.githubusercontent.com/nodejs/node/$NODE_VERSION/deps/v8/include/v8-fast-api-calls.h" > "$LIBS_PATH/v8-fast-api-calls.h"
fi

# configure compile commands to copy over project root
$NODE_GYP_BIN configure -- -f compile_commands_json
cp $BUILD_PATH/Release/compile_commands.json $(pwd)

# dispatch configuration
$NODE_GYP_BIN configure
