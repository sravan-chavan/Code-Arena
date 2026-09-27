FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget

# Build context is the repository root so the shared messaging package is available.
COPY packages/messaging /packages/messaging
WORKDIR /packages/messaging
RUN npm install --omit=dev --allow-file=all --allow-directory=all

WORKDIR /app
COPY services/worker/package.json ./
RUN printf 'allow-file=all\nallow-directory=all\ninstall-links=true\n' > .npmrc \
  && npm install --omit=dev \
  && rm -f .npmrc

COPY services/worker/ .

ENV NODE_ENV=production
ENV PORT=4001
ENV CODEARENA_SERVICE_NAME=worker
ENV RABBITMQ_RECONNECT_ENABLED=true
EXPOSE 4001

CMD ["node", "src/index.js"]
