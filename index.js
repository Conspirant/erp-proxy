/**
 * SVIT Accredia ERP Reverse Proxy Gateway
 * Deployable on Render / Railway / Fly.io / VPS
 *
 * Target: https://svit-students.accredia.in:8084
 * 
 * Features:
 * - Transparently forwards all HTTP/HTTPS requests to port 8084
 * - Full cookie / Set-Cookie header preservation
 * - Handles both GET and POST requests with bodies
 * - Automatic connection pooling and keep-alive
 * - CORS headers enabled for all origins
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 8080;
const TARGET_HOST = 'svit-students.accredia.in';
const TARGET_PORT = 8084;
const TARGET_ORIGIN = `https://${TARGET_HOST}:${TARGET_PORT}`;

// Custom HTTPS Agent to ignore self-signed certificates and maintain connection pool
const agent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, Location');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: TARGET_ORIGIN, timestamp: new Date().toISOString() }));
    return;
  }

  // Build clean request headers to forward
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
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: forwardHeaders,
    agent: agent,
    timeout: 30000,
  };

  const proxyReq = https.request(proxyOptions, (proxyRes) => {
    // Rewrite Set-Cookie to ensure cookies work across domains
    const responseHeaders = { ...proxyRes.headers };

    // Rewrite Location headers if redirect occurs
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

  // Pipe the incoming request body (for POST requests) into the proxy request
  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, () => {
  console.log(`[SVIT Gateway Proxy] Listening on port ${PORT}`);
  console.log(`[SVIT Gateway Proxy] Target: ${TARGET_ORIGIN}`);
});
