FROM node:20-bullseye-slim

WORKDIR /app

# Install curl, bash, ca-certificates, and wget
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Install wgcf (Official WARP WireGuard configuration generator)
RUN wget -q -O /usr/local/bin/wgcf https://github.com/ViRb3/wgcf/releases/download/v2.2.22/wgcf_2.2.22_linux_amd64 \
    && chmod +x /usr/local/bin/wgcf

# Install wireproxy (Userspace WireGuard client exposing SOCKS5 proxy)
RUN wget -q -O /tmp/wireproxy.tar.gz https://github.com/windtf/wireproxy/releases/download/v1.0.9/wireproxy_linux_amd64.tar.gz \
    && tar -xzvf /tmp/wireproxy.tar.gz -C /usr/local/bin wireproxy \
    && chmod +x /usr/local/bin/wireproxy \
    && rm -f /tmp/wireproxy.tar.gz

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY index.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Render sets PORT dynamically (default 8080)
EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
