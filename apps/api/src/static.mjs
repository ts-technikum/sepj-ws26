// Liefert das gebaute Frontend (apps/web/dist) aus, damit im Betrieb ein
// einziger Dienst reicht: Browser und API unter derselben Adresse, kein CORS.
// Unbekannte Pfade ohne Dateiendung bekommen index.html (Single-Page-App).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticHandler(dir) {
  const root = resolve(dir);
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(`STATIC_DIR "${root}" enthält keine index.html. Erst "npm run build:web" ausführen.`);
  }

  const fileFor = (pathname) => {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    if (decoded.includes('\0')) return null;
    const full = resolve(root, '.' + normalize('/' + decoded));
    if (full !== root && !full.startsWith(root + sep)) return null;
    try { return statSync(full).isFile() ? full : null; } catch { return null; }
  };

  // Rückgabe true, wenn die Anfrage beantwortet wurde.
  return function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let file = fileFor(pathname);
    if (!file) {
      if (extname(pathname)) return false;
      file = join(root, 'index.html');
    }
    const immutable = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Length': statSync(file).size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
