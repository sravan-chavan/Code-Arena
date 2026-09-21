FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start"]
