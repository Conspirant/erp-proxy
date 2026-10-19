#!/bin/bash
set -e

echo "[WARP Startup] Initializing Cloudflare WARP with wireproxy..."

if [ ! -f /app/wireproxy.conf ]; then
  echo "[WARP Startup] Generating Cloudflare WARP credentials with wgcf..."
  cd /app
  wgcf register --accept-tos
  wgcf generate
  
  PRIVATE_KEY=$(grep "PrivateKey" wgcf-profile.conf | awk '{print $3}')
  IPV4_ADDR=$(grep "Address" wgcf-profile.conf | head -n 1 | awk '{print $3}')
  IPV6_ADDR=$(grep "Address" wgcf-profile.conf | tail -n 1 | awk '{print $3}')
  ENDPOINT=$(grep "Endpoint" wgcf-profile.conf | awk '{print $3}')
  PUBLIC_KEY=$(grep "PublicKey" wgcf-profile.conf | awk '{print $3}')

  # Use [Http] proxy on 127.0.0.1:3128 for reliable HTTP/HTTPS tunneling through WARP
  cat <<EOF > /app/wireproxy.conf
[Interface]
PrivateKey = ${PRIVATE_KEY}
Address = ${IPV4_ADDR}
Address = ${IPV6_ADDR}
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = ${PUBLIC_KEY}
Endpoint = ${ENDPOINT}
AllowedIPs = 0.0.0.0/0
AllowedIPs = ::/0
PersistentKeepalive = 25

[Http]
BindAddress = 127.0.0.1:3128
EOF

  echo "[WARP Startup] wireproxy.conf created successfully."
fi

echo "[WARP Startup] Starting wireproxy HTTP proxy on 127.0.0.1:3128..."
wireproxy -c /app/wireproxy.conf &

echo "[WARP Startup] Waiting for WARP HTTP tunnel to establish..."
for i in $(seq 1 15); do
  if curl -s -m 2 -x http://127.0.0.1:3128 https://cloudflare.com/cdn-cgi/trace | grep -q "warp=on"; then
    echo "[WARP Startup] Cloudflare WARP tunnel is active (warp=on)!"
    break
  fi
  sleep 1
done

echo "[WARP Startup] Starting Node.js Reverse Proxy Gateway on port ${PORT:-8080}..."
exec node index.js
