/**
 * SVIT Accredia ERP Reverse Proxy Gateway
 * Routes HTTPS traffic to port 8084 via Cloudflare WARP HTTP CONNECT tunnel
 *
 * Target: https://svit-students.accredia.in:8084
 */

const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PORT = process.env.PORT || 8080;
const WARP_HTTP_PROXY = process.env.HTTP_PROXY || 'http://127.0.0.1:3128';
const TARGET_HOST = 'svit-students.accredia.in';
const TARGET_PORT = 8084;
const TARGET_ORIGIN = `https://${TARGET_HOST}:${TARGET_PORT}`;

// Create HttpsProxyAgent pointing to wireproxy's local HTTP CONNECT proxy
let agent;
try {
  agent = new HttpsProxyAgent(WARP_HTTP_PROXY, {
    rejectUnauthorized: false,
    timeout: 30000,
  });
  console.log(`[SVIT Gateway Proxy] Routing through WARP HTTP Tunnel: ${WARP_HTTP_PROXY}`);
} catch (e) {
  console.warn(`[SVIT Gateway Proxy] Direct agent fallback:`, e.message);
  agent = new https.Agent({
    rejectUnauthorized: false,
    timeout: 30000,
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Location');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      target: TARGET_ORIGIN,
      warp: true,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  const forwardHeaders = { ...req.headers };
  forwardHeaders['host'] = `${TARGET_HOST}:${TARGET_PORT}`;
  forwardHeaders['origin'] = TARGET_ORIGIN;

  if (forwardHeaders['referer']) {
    const currentOrigin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['host']}`;
    forwardHeaders['referer'] = forwardHeaders['referer'].replace(currentOrigin, TARGET_ORIGIN);
  }

  delete forwardHeaders['x-forwarded-for'];
  delete forwardHeaders['x-real-ip'];

  const proxyOptions = {
    protocol: 'https:',
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: forwardHeaders,
    agent: agent,
    servername: TARGET_HOST,
    rejectUnauthorized: false,
    timeout: 30000,
  };

  const proxyReq = https.request(proxyOptions, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };

    if (responseHeaders['location']) {
      const loc = responseHeaders['location'];
      const myOrigin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['host']}`;
      responseHeaders['location'] = loc.replace(TARGET_ORIGIN, myOrigin);
    }

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Proxy Gateway Error',
        message: err.message,
        target: `${TARGET_ORIGIN}${req.url}`,
      }));
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream ERP Gateway Timeout' }));
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SVIT Gateway Proxy] Listening on port ${PORT}`);
  console.log(`[SVIT Gateway Proxy] Target: ${TARGET_ORIGIN}`);
});
