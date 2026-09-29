# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install a simple HTTP server to serve the built app
RUN npm install -g serve

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./

# Expose port
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "dist", "-l", "3000"]
