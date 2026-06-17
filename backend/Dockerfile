# ─── Stage 1: Install dependencies ─────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Production image ─────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Create logs directory owned by appuser
RUN mkdir -p logs && chown -R appuser:nodejs logs

USER appuser

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "src/server.js"]
