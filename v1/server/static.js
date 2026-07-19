// Minimal static file server. Routes /shared and /assets to their dirs, everything else to client/.
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const ROOT = path.join(__dirname, '..');
const DIRS = {
  client: path.join(ROOT, 'client'),
  shared: path.join(ROOT, 'shared'),
  assets: path.join(ROOT, 'assets')
};

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') return path.join(DIRS.client, 'index.html');
  const parts = p.replace(/^\/+/, '').split('/');
  let base, rest;
  if (parts[0] === 'shared') { base = DIRS.shared; rest = parts.slice(1); }
  else if (parts[0] === 'assets') { base = DIRS.assets; rest = parts.slice(1); }
  else { base = DIRS.client; rest = parts; }
  const full = path.join(base, ...rest);
  // Path traversal guard: resolved path must stay under its base dir.
  if (!full.startsWith(base)) return null;
  return full;
}

function serve(req, res) {
  const file = resolve(req.url);
  if (!file) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

module.exports = { serve };
