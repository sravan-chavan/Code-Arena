FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start"]
