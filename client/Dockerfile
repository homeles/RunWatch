# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Set environment variables for the build
ARG REACT_APP_API_URL=http://localhost/api
ARG REACT_APP_WEBSOCKET_URL=ws://localhost
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_WEBSOCKET_URL=${REACT_APP_WEBSOCKET_URL}

# Build the app
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy entrypoint script for runtime environment variable replacement
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]