FROM node:22-alpine AS builder
WORKDIR /app

# Install all deps (including devDependencies for the Vite build)
COPY package*.json ./
COPY client ./client
RUN npm ci
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-alpine
LABEL org.opencontainers.image.source = "https://github.com/nexed-tech/kantahan"

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=builder /app/dist ./dist

EXPOSE 3000
ENV NODE_OPTIONS=--experimental-sqlite
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
