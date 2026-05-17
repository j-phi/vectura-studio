#!/usr/bin/env node
// Tiny zero-dependency static file server for Playwright e2e tests.
// Replaces `python3 -m http.server`, which is single-threaded and cannot
// keep up with concurrent petalis-profile JSON fetches from parallel workers.
// Node's http module is async/non-blocking, so concurrent requests are served
// without head-of-line blocking on a single thread.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const HOST = '127.0.0.1';

const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  const finish = (status) => {
    process.stdout.write(`${req.method} ${req.url} ${status} ${Date.now() - started}ms\n`);
  };

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname || '/');
  } catch {
    send(res, 400, 'Bad Request');
    return finish(400);
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const resolved = path.resolve(ROOT, '.' + pathname);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Forbidden');
    return finish(403);
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not Found');
      return finish(404);
    }
    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = s ? parseInt(s, 10) : 0;
      const end = e ? parseInt(e, 10) : stat.size - 1;
      if (start > end || end >= stat.size) {
        send(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${stat.size}` });
        return finish(416);
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(resolved, { start, end }).pipe(res).on('close', () => finish(206));
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(resolved).pipe(res).on('close', () => finish(200));
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`dev-server listening on http://${HOST}:${PORT} (root: ${ROOT})\n`);
});
