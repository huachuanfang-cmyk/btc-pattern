const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.pathname); }
  catch { response.writeHead(400); response.end('Bad Request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.stat(file, (statError, stat) => {
    if (!statError && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.stat(file, (fileError, fileStat) => {
      if (fileError || !fileStat.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not Found');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(response);
    });
  });
});

server.listen(port, host, () => console.log(`Static QA server listening on http://${host}:${port}`));

function close() { server.close(() => process.exit(0)); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
