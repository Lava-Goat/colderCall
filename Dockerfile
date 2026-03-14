# ── Build stage: compile native modules (better-sqlite3) ──────────────────────
FROM node:lts-alpine AS build

WORKDIR /app

# Install build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:lts-alpine

WORKDIR /app

# Copy compiled node_modules from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application source
COPY server.js app.js index.html styles.css ./

# SQLite data lives here; mount a volume to persist it
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
