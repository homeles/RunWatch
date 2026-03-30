#!/bin/sh
set -e

# Runtime environment variable replacement in built JS bundles.
#
# The React build bakes in default API URLs (e.g. http://localhost/api).
# When deploying to a different host (Kubernetes, remote server), pass
# REACT_APP_API_URL and REACT_APP_WEBSOCKET_URL as runtime env vars
# to override those defaults at container startup.
#
# IMPORTANT: If the env vars are NOT set, we skip replacement entirely
# so the build-time defaults remain intact (required for docker-compose
# where nginx proxies /api to the backend).

if [ -n "${REACT_APP_API_URL}" ] || [ -n "${REACT_APP_WEBSOCKET_URL}" ]; then
  echo "Runtime env override detected — replacing API URLs in JS bundles..."
  for file in /usr/share/nginx/html/static/js/*.js; do
    if [ -f "$file" ]; then
      echo "  Processing $file..."
      if [ -n "${REACT_APP_API_URL}" ]; then
        sed -i "s|http://localhost/api|${REACT_APP_API_URL}|g" "$file"
      fi
      if [ -n "${REACT_APP_WEBSOCKET_URL}" ]; then
        sed -i "s|ws://localhost|${REACT_APP_WEBSOCKET_URL}|g" "$file"
      fi
    fi
  done
  echo "URL replacement complete."
else
  echo "No runtime API URL overrides set — using build-time defaults."
fi

echo "Starting Nginx..."
exec "$@"
