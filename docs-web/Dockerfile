FROM ragestudio/ultragateway:latest AS build

# Install dependencies
RUN apt update -y
RUN apt install -y curl nscd git ssh build-essential
RUN curl -sf https://gobinaries.com/tj/node-prune | sh

# Create workdir
RUN mkdir -p /app
WORKDIR /app

# Copy Files
COPY . .

# Fix permissions
RUN chmod -R 777 /app
RUN chown -R node:node /app

# Set user to node
USER node

# Install modules
RUN IS_ACTION_RUNNER=true npm install
RUN npm run docs:build
RUN npm cache clean --force
RUN rm package-lock.json

RUN node-prune

FROM ragestudio/ultragateway:latest AS runtime

# Create app workdir
RUN mkdir -p /app
WORKDIR /app

# copy app dir
COPY --from=build /app /app

# Fix permissions
RUN chmod -R 777 /app
RUN chown -R node:node /app

# Set user to node
USER node

# Start app
ENV NODE_ENV=production
CMD ["npm", "run", "docs:serve"]
