# ---- Build stage ----
FROM node:20-alpine AS builder

# Required to compile better-sqlite3 (native Node addon) on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

RUN npm install -g pnpm@10

# Copy manifests + patches first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Explicitly compile better-sqlite3 native addon
RUN pnpm rebuild better-sqlite3

# Copy source and build
COPY . .
RUN pnpm build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy node_modules from builder (already compiled with native addons)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built frontend + backend from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config + schema for migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
