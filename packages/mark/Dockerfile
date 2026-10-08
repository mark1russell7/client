# Multi-stage build for Mark CLI Server
# Usage:
#   docker build -t mark-server .
#   docker run -d -p 3000:3000 mark-server

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Build stage
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Runtime stage
FROM base AS runtime

# Copy built artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

# Create .mark directory for lockfile/logs
RUN mkdir -p /root/.mark

# Server configuration via environment variables
ENV MARK_SERVER_PORT=3000
ENV MARK_SERVER_HOST=0.0.0.0

# Expose the default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:${MARK_SERVER_PORT}/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run server in foreground (not daemon mode)
CMD ["node", "dist/cli.js", "--server"]
