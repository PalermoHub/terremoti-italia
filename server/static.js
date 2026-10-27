import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pbf': 'application/x-protobuf',
  '.webmanifest': 'application/manifest+json',
};

// Percorso su disco per un indirizzo, o null se esce dalla radice
export function risolviPercorso(radice, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p === '/' || p === '') p = '/index.html';
  const base = resolve(radice);
  const file = resolve(base, '.' + p);
  return file === base || file.startsWith(base + sep) ? file : null;
}

export function creaServer({ radice, gestisciExtra }) {
  return http.createServer(async (req, res) => {
    try {
      if (gestisciExtra && await gestisciExtra(req, res)) return;
      const file = req.method === 'GET' || req.method === 'HEAD' ? risolviPercorso(radice, req.url) : null;
      let ok = false;
      try { ok = file && statSync(file).isFile(); } catch { /* assente */ }
      // Un intervallo di glifi mancante non deve dare 404: MapLibre farebbe fallire tutto il tile (a zoom basso, nomi in molti alfabeti). Vuoto = nessun glifo.
      if (!ok && /^\/fonts\/glyphs\/[^/]+\/\d+-\d+\.pbf$/.test(req.url.split('?')[0])) { res.writeHead(200, { 'content-type': 'application/x-protobuf', 'content-length': 0 }); res.end(); return; }
      if (!ok) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('non trovato'); return; }
      res.writeHead(200, { 'content-type': TIPI[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('errore del server');
      console.error(e);
    }
  });
}
