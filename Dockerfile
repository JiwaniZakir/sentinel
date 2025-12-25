# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client (use dummy URL - prisma generate doesn't need real DB)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copy source code
COPY src ./src/

# Set environment
ENV NODE_ENV=production

# Expose port (for HTTP mode)
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]

