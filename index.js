/**
 * Direct HTTPS Reverse Proxy Gateway (No UDP/WireGuard dependency)
 * Built with native connection pool and TLS SNI handling
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;
const TARGET_HOST = 'svit-students.accredia.in';
const TARGET_PORT = 8084;
const TARGET_ORIGIN = `https://${TARGET_HOST}:${TARGET_PORT}`;

// High-performance HTTPS agent with custom DNS and TLS settings
const agent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 30000,
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, HEAD');
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
    res.end(JSON.stringify({ status: 'ok', target: TARGET_ORIGIN, mode: 'direct-tcp' }));
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
  console.log(`[SVIT Gateway Proxy] Direct TCP mode listening on 0.0.0.0:${PORT}`);
  console.log(`[SVIT Gateway Proxy] Target: ${TARGET_ORIGIN}`);
});
