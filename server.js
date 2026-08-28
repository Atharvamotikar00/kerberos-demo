// Plain Node.js http server -- no npm dependencies required, just `node server.js`.
// Routes /api/as/*, /api/tgs/*, /api/app-server/* to the three protocol
// modules (each of which only imports the keys it's entitled to), and serves
// the static frontend (public/) for everything else.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const as = require('./as');
const tgs = require('./tgs');
const appServer = require('./appServer');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Each handler receives the parsed JSON body and returns { status, body }.
const routes = {
  'POST /api/as/register': (b) => as.register(b),
  'POST /api/as/request-init': (b) => as.requestInit(b),
  'POST /api/as/authenticate': (b) => as.authenticate(b),
  'POST /api/tgs/request': (b) => tgs.request(b),
  'POST /api/app-server/request': (b) => appServer.request(b),
};

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const routeKey = `${req.method} ${pathname}`;

  if (routes[routeKey]) {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (e) {
        return sendJson(res, 400, { error: 'BAD_REQUEST', message: 'Invalid JSON body.' });
      }
      try {
        const result = routes[routeKey](parsed);
        sendJson(res, result.status, result.body);
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { error: 'INTERNAL_ERROR', message: e.message });
      }
    });
    return;
  }

  if (req.method === 'GET') return serveStatic(res, pathname);

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Kerberos demo running at http://localhost:${PORT}`);
});
