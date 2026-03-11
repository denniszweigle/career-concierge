# ---- Build stage ----
FROM node:20-slim AS builder

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
FROM node:20-slim AS runtime

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built frontend + backend from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
