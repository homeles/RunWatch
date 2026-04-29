FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies strictly from lockfile
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose the port (will be overridden by docker-compose)
EXPOSE 5001

# Start the server
CMD ["npm", "start"]