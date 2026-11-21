# TvMaster v1.0.0 Dockerfile
# Lightweight container bundling Node.js and android-tools (ADB client)
FROM node:20-alpine

# Install android-tools (ADB) and basic network utilities
RUN apk add --no-cache android-tools curl ca-certificates tzdata

WORKDIR /app

# Persistent ADB configuration directory (stores pairing keys)
RUN mkdir -p /root/.android && chmod 700 /root/.android

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY src/ ./src/
COPY public/ ./public/

# Expose web dashboard port
EXPOSE 3055

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3055/api/health || exit 1

# Environment defaults
ENV PORT=3055 \
    NODE_ENV=production

CMD ["node", "src/server.js"]
