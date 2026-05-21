FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY dist ./dist

EXPOSE 3000
ENV NODE_OPTIONS=--experimental-sqlite
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
