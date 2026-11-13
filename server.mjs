import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const publicFiles = new Set(['index.html', 'styles.css', 'app.js']);

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = resolve(root, relative);
  if (!file.startsWith(root + sep) || (!publicFiles.has(relative) && !/^assets\/[a-z0-9_-]+\.(png|svg)$/.test(relative))) {
    response.writeHead(404); response.end('Not found'); return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Порт ${port} занят. Задайте другой: $env:PORT=5174; npm.cmd start`);
  else console.error(error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`\n  Копилка запущена\n  На компьютере: http://localhost:${port}\n`);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) console.log(`  В локальной сети: http://${entry.address}:${port}`);
    }
  }
  console.log('\n  Для остановки нажмите Ctrl+C.\n');
});
