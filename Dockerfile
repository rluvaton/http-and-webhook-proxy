ARG BUILD_FROM
FROM node:16.16-alpine AS node

#ARG BUILD_FROM
FROM $BUILD_FROM

COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

# Enable to pass signals to the process
# See more [here](https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/#:~:text=To%20quote%20the,our%20container%20image.)
RUN apk add dumb-init

ENV NODE_ENV production
ENV LOCAL_HOME_ASSISTANT_URL http://host.docker.internal:8123

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies.
RUN npm ci --only=production

# Copy local code to the container image.
COPY . .

# Run the web service on container startup.
CMD [ "dumb-init", "node", "src/client.js" ]
