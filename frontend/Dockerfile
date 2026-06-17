# ─── Stage 1: Build the React app ──────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env var — set to your backend URL
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Stage 2: Serve with Nginx ─────────────────────────────
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
