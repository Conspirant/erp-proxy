#!/bin/bash
set -e

echo "[Startup] Starting Direct TCP Node.js Proxy on port ${PORT:-8080}..."
exec node index.js
