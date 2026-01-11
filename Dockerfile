# ============================================================================
# AgentsStack Platform Dockerfile
# Next.js 14 production build with TypeScript support
# ============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies using npm (package-lock.json)
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then \
    npm ci; \
  else \
    npm install; \
  fi

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Accept build arguments from docker-compose (only for build-time needs)
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Pass build args as ENV for Next.js build (only NEXT_PUBLIC_ vars needed at build time)
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY

# Provide placeholder for build-time validation (will be overridden at runtime)
ENV MONGODB_URI="mongodb://placeholder:27017/agentstack"
ENV OPENROUTER_API_KEY="placeholder"
ENV VOYAGE_API_KEY="placeholder"

# Build the Next.js application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
