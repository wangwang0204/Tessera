# ==========================================
# Stage 1: Build Editor Bundle
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:editor

# ==========================================
# Stage 2: Minimal Production Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_FILE=/data/notebook.json

# Copy server scripts and web assets
COPY --from=builder /build/server.cjs ./
COPY --from=builder /build/store.cjs ./
COPY --from=builder /build/model.cjs ./
COPY --from=builder /build/index.html ./
COPY --from=builder /build/style.css ./
COPY --from=builder /build/renderer.js ./
COPY --from=builder /build/web-adapter.js ./
COPY --from=builder /build/editor.bundle.js ./
COPY --from=builder /build/timeline-layout.js ./
COPY --from=builder /build/master-groups.js ./
COPY --from=builder /build/canvas-align.js ./
COPY --from=builder /build/note-header.js ./

# Data volume for notebook.json
VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.cjs"]
