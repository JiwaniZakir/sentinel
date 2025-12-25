# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (need prisma CLI for runtime generate)
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/

# Copy source code
COPY src ./src/

# Set environment
ENV NODE_ENV=production

# Expose port (for HTTP mode)
EXPOSE 3000

# Generate prisma client and start app (prisma generate runs at runtime with real DATABASE_URL)
CMD npx prisma generate && npx prisma db push --skip-generate && node src/index.js

