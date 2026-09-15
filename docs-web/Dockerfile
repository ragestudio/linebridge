FROM node:24-trixie-slim AS build

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable

WORKDIR /base

COPY docs /base/docs
COPY docs-web /base/web

# Install vue at root so docs can resolve it
RUN pnpm add vue@^3.5.42 @vue/server-renderer@^3.5.42
RUN printf "packages:\n  - 'web'\n  - 'docs'\nblockExoticSubdeps: false\n" > pnpm-workspace.yaml

WORKDIR /base/web

# Install all dependencies & build the docs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --no-frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm run docs:build

# Clean up massive unnecessary binaries in uWebSockets.js
RUN find node_modules -name "uws_darwin_*.node" -type f -delete && \
    find node_modules -name "uws_win32_*.node" -type f -delete

#### RUNTIME
FROM node:24-trixie-slim AS runtime

# Set environment
ENV NODE_ENV=production

# Set user for security
USER node

# Copy the app from the build stage
COPY --from=build --chown=node:node /base /app

WORKDIR /app/web

# Start server
CMD ["npm", "run", "docs:serve"]
