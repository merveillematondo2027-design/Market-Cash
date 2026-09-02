import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');
const port = Number(process.env.PORT || 8080);
const host = '0.0.0.0';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath, statusCode = 200) {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      if (filePath !== indexPath) {
        return sendFile(res, indexPath, 200);
      }
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Market-Cash frontend build is unavailable.');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(statusCode, {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const candidate = path.resolve(distPath, relativePath);

    if (!candidate.startsWith(path.resolve(distPath))) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Bad request');
    }

    fs.stat(candidate, (error, stat) => {
      if (!error && stat.isFile()) {
        return sendFile(res, candidate);
      }
      return sendFile(res, indexPath);
    });
  } catch (error) {
    console.error('[MARKET_CASH_SERVER_REQUEST_ERROR]', error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
});

server.on('error', (error) => {
  console.error('[MARKET_CASH_SERVER_ERROR]', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`[MARKET_CASH_SERVER_STARTED] http://${host}:${port}`);
  console.log(`[MARKET_CASH_DIST_PATH] ${distPath}`);
});
