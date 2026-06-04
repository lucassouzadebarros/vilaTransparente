const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 19006);
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8080';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json'
};

function proxyApi(req, res) {
  const target = new URL(req.url, apiTarget);
  const proxyReq = http.request({
    hostname: target.hostname,
    port: target.port || 80,
    path: `${target.pathname}${target.search}`,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'API local não respondeu. Confira se o backend está rodando na porta 8080.' }));
  });

  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') {
    pathname = '/index.html';
  }
  const file = path.join(root, pathname);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      fs.readFile(path.join(root, 'index.html'), (fallbackErr, fallbackBody) => {
        res.writeHead(fallbackErr ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackErr ? 'not found' : fallbackBody);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`serving http://localhost:${port}`);
  console.log(`proxying /api to ${apiTarget}`);
});
