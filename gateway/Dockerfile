FROM golang:1.26-alpine AS build

RUN apk add --no-cache make lscpu

WORKDIR /build

COPY . .

RUN make build

# Runtime
FROM node:24-trixie-slim AS runtime

RUN apt update
RUN apt install -y curl bash nscd

COPY --from=build /build/bin/ultragateway /usr/local/bin/
