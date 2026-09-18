#!/bin/bash
set -euo pipefail

OUT_DIR=$(pwd)/dist
NODE_GYP_BIN=./node_modules/.bin/node-gyp
TSC_BIN=./node_modules/.bin/tsc
TSC_ALIAS_BIN=./node_modules/.bin/tsc-alias

APPLY_TEMP_JSON() {
    mv "$OUT_DIR/package.json.tmp" "$OUT_DIR/package.json"
}

# check if dist directory exists, if exists, remove it
if [ -d "$OUT_DIR" ]; then
  rm -rf "$OUT_DIR"
fi

# First compile and resolve paths & aliases
$TSC_BIN && printf "TypeScript build completed.\n"
$TSC_ALIAS_BIN -f && printf "TypeScript alias computed.\n"

# copy some base files to the dist directory
cp package.json $OUT_DIR
cp README.md $OUT_DIR
cp LICENSE $OUT_DIR
cp install.mjs $OUT_DIR

# now, must update the main/type fields in the dist package.json
jq '.main = "./lib/index.js" | .types = "./lib/index.d.ts"' "$OUT_DIR/package.json" > "$OUT_DIR/package.json.tmp"
APPLY_TEMP_JSON

# remove useless scripts fields
jq '.scripts |= { install }' "$OUT_DIR/package.json" > "$OUT_DIR/package.json.tmp"
APPLY_TEMP_JSON

# remove devDependencies (they contain workspace:* which can't resolve outside the monorepo)
jq 'del(.devDependencies)' "$OUT_DIR/package.json" > "$OUT_DIR/package.json.tmp"
APPLY_TEMP_JSON

# update the exports field in the dist package.json
jq '.exports |= map_values(sub("^\\./src/"; "./lib/") | sub("\\.ts$"; ".js"))' "$OUT_DIR/package.json" > "$OUT_DIR/package.json.tmp"
APPLY_TEMP_JSON

ls -la $OUT_DIR

BUILD_ARCH=${1:-}

printf "Compiling uws binary for [$BUILD_ARCH]\n"

if [ "$BUILD_ARCH" == "arm64" ]; then
    export CC=aarch64-linux-gnu-gcc
    export CXX=aarch64-linux-gnu-g++
    export npm_config_arch=arm64

    JOBS=max $NODE_GYP_BIN configure --arch=arm64
    JOBS=max $NODE_GYP_BIN build
fi

if [ "$BUILD_ARCH" == "x64" ]; then
    export CC=x86_64-linux-gnu-gcc
    export CXX=x86_64-linux-gnu-g++
    export npm_config_arch=x64

    JOBS=max $NODE_GYP_BIN configure --arch=x64
    JOBS=max $NODE_GYP_BIN build
fi

printf "✅ Build completed.\n"
