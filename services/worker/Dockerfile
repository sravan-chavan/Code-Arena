FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=4001
EXPOSE 4001

CMD ["node", "src/index.js"]
