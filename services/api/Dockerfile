FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget python3 make g++

# Build context is the repository root so the shared messaging package is available.
COPY packages/messaging /packages/messaging
WORKDIR /packages/messaging
RUN npm install --omit=dev --allow-file=all --allow-directory=all

WORKDIR /app
COPY services/api/package.json ./
RUN printf 'allow-file=all\nallow-directory=all\ninstall-links=true\ndangerously-allow-all-scripts=true\n' > .npmrc \
  && npm install --omit=dev \
  && rm -f .npmrc

COPY services/api/ .

ENV NODE_ENV=production
ENV PORT=4000
ENV CODEARENA_SERVICE_NAME=api
EXPOSE 4000

CMD ["npm", "run", "start"]
