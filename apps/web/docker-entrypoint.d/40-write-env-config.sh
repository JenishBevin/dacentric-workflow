#!/bin/sh
# nginx's base image auto-runs every executable script in this directory
# before starting nginx. Writes the real API URL from the runtime
# VITE_API_BASE_URL env var into the static file the page loads first.
set -eu

cat <<EOF > /usr/share/nginx/html/env-config.js
window.__RUNTIME_CONFIG__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-}"
};
EOF
