/**
 * SVIT Accredia ERP Reverse Proxy Gateway
 * Powered by http-proxy & Cloudflare WARP SOCKS5 Tunnel
 *
 * Target: https://svit-students.accredia.in:8084
 */

const http = require('http');
const httpProxy = require('http-proxy');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PORT = process.env.PORT || 8080;
const SOCKS_PROXY = process.env.SOCKS_PROXY || 'socks5h://127.0.0.1:1080';
const TARGET_HOST = 'svit-students.accredia.in';
const TARGET_PORT = 8084;
const TARGET_ORIGIN = `https://${TARGET_HOST}:${TARGET_PORT}`;

// SOCKS5 agent that tunnels all outgoing HTTPS to WARP
const agent = new SocksProxyAgent(SOCKS_PROXY, {
  rejectUnauthorized: false,
  timeout: 30000,
});

// Create http-proxy instance
const proxy = httpProxy.createProxyServer({
  target: TARGET_ORIGIN,
  agent: agent,
  secure: false,
  changeOrigin: true,
  autoRewrite: true,
  cookieDomainRewrite: '',
  headers: {
    host: `${TARGET_HOST}:${TARGET_PORT}`,
    origin: TARGET_ORIGIN,
  },
});

proxy.on('error', (err, req, res) => {
  console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Proxy Gateway Error',
      message: err.message,
      target: `${TARGET_ORIGIN}${req.url}`,
    }));
  }
});

const server = http.createServer((req, res) => {
  // Always support CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Location');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: TARGET_ORIGIN, warp: true }));
    return;
  }

  // Rewrite referer if needed
  if (req.headers['referer']) {
    const currentOrigin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['host']}`;
    req.headers['referer'] = req.headers['referer'].replace(currentOrigin, TARGET_ORIGIN);
  }

  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];

  // Forward through http-proxy
  proxy.web(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SVIT Gateway Proxy] Listening on 0.0.0.0:${PORT}`);
  console.log(`[SVIT Gateway Proxy] Target: ${TARGET_ORIGIN}`);
  console.log(`[SVIT Gateway Proxy] WARP SOCKS5: ${SOCKS_PROXY}`);
});
