# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set dummy DATABASE_URL for prisma generate (only needs schema, not real connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Set environment
ENV NODE_ENV=production

# Expose port (for HTTP mode)
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]

