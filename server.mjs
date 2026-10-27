/**
 * Serves the built console on Railway. No dependencies: Node's own http and fs only.
 * Any path that is not a real file falls back to index.html, so client-side routes
 * such as /sign-in survive a refresh or a pasted link.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(file, res, cacheOverride) {
  const ext = path.extname(file).toLowerCase();
  // Vite fingerprints everything under /assets, so those can be cached hard; index.html must not be.
  const cache = cacheOverride ?? (file.includes(`${path.sep}assets${path.sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600');
  res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).on('error', () => res.end()).pipe(res);
}

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.join(DIST, rel);
  if (full !== DIST && !full.startsWith(DIST + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(full, (err, st) => {
    if (!err && st.isFile()) return serve(full, res);
    serve(path.join(DIST, 'index.html'), res, 'no-cache');
  });
});

server.listen(PORT, () => console.log(`Expenso console listening on ${PORT}`));
