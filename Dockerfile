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

# Copy source and build
COPY . .
RUN pnpm build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

# Required to compile better-sqlite3 in the runtime install
RUN apk add --no-cache python3 make g++

WORKDIR /app

RUN npm install -g pnpm@10

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend + backend from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
