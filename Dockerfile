# Use official Node.js runtime (updated to Node 20 to avoid SSL issues)
FROM node:20

# Set working directory in container
WORKDIR /app

# Set OpenSSL legacy provider as fallback (if needed)
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Configure npm for better compatibility
RUN npm config set strict-ssl false && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set legacy-peer-deps true

# Install curl for health check
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (excluding dev dependencies)
RUN npm install --omit=dev --no-audit --no-fund

# Copy application code
COPY . .

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nextjs

# Change ownership of app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]