# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only (no native build toolchain needed)
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Runtime image
FROM base AS runner

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY index.js ./
COPY scripts ./scripts
COPY src ./src

# Fly sets PORT to match fly.toml internal_port
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
