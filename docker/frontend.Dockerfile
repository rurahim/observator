# =============================================================================
# frontend.Dockerfile — Multi-stage build for the Observator React frontend
# =============================================================================
#
# WHY MULTI-STAGE:
# Stage 1 (build): Installs Node.js, npm dependencies, and runs `vite build`
#   to produce optimized static files. This stage has ~500MB of node_modules.
# Stage 2 (serve): Copies ONLY the built files (~5MB) into a tiny nginx image.
#   Final image is ~25MB instead of ~500MB. Faster pulls, smaller attack surface.
#
# WHAT'S HAPPENING:
# 1. Use node:20-alpine as build base (small, fast, has npm)
# 2. Copy package.json + lock first (Docker layer caching: deps only rebuild
#    when package.json changes, not when source code changes)
# 3. Run `npm ci` (deterministic install from lockfile, faster than `npm install`)
# 4. Copy source and build with Vite
# 5. Copy dist/ into nginx:alpine and add our custom nginx.conf
#
# GOTCHAS:
# - VITE_API_URL is a build-time variable (baked into JS bundle). It MUST be
#   set at build time via --build-arg, not at runtime. For CloudFront+ALB setup,
#   we set it to "" (empty) so the frontend uses relative URLs and CloudFront
#   routes /api/* to the ALB.
# - The nginx image runs as non-root (nginx user, UID 101) by default on
#   nginx:1.27-alpine. We create writable dirs for pid/cache/logs.
# - node:20-alpine uses musl libc. If you have native dependencies that need
#   glibc, use node:20-slim instead.
#
# PRO TIP:
# In CI, you can cache the npm install layer across builds by using
# --cache-from with your registry. This cuts build time from 2min to 30sec.
# =============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY uae-labour-pulse/package.json uae-labour-pulse/package-lock.json ./

# Install dependencies deterministically from lockfile
# --ignore-scripts: skip postinstall scripts (security + speed)
RUN npm ci --ignore-scripts

# Copy source code
COPY uae-labour-pulse/ .

# Build-time env var: API URL for the frontend to call
# Empty string = relative URLs (frontend and API on same domain via CloudFront)
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

# Build the production bundle
RUN npm run build

# ── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx config and static files
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy our custom nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy built static files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Create writable directories for non-root nginx
RUN mkdir -p /var/cache/nginx /var/log/nginx /tmp && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /tmp /usr/share/nginx/html

# Run as non-root user
USER nginx

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
