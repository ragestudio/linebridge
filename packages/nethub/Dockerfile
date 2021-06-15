FROM node:16-alpine

# copy source
COPY . /app
WORKDIR /app

ENV LISTEN_PORT 1010

EXPOSE ${LISTEN_PORT}

# install dependencies
RUN npm -g install corenode
RUN npm install

# run builder
RUN corenode build

CMD corenode ./dist/index.js --listenPort=${LISTEN_PORT}