const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { NotebookStore } = require('./store.cjs');
const { mergeNotebooks } = require('./sync-merge.cjs');

function resolveDefaultDataPath() {
  if (process.env.MY_NOTES_DATA_FILE) return process.env.MY_NOTES_DATA_FILE;
  if (process.env.DATA_FILE) return process.env.DATA_FILE;
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Tessera', 'notebook.json');
  }
  return path.join(os.homedir(), '.config', 'tessera', 'notebook.json');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function createServerApp({ dataPath } = {}) {
  const notebookPath = dataPath || resolveDefaultDataPath();
  const store = new NotebookStore(notebookPath);
  const sseClients = new Set();

  function broadcastSSE(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(msg);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  const handler = async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
      return;
    }

    if (pathname === '/api/snapshot' && req.method === 'GET') {
      try {
        const snapshot = store.snapshot();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snapshot));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/mutate' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const next = store.mutate(body.action, body.payload, body.digest);
        broadcastSSE(next);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(next));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/sync' && req.method === 'POST') {
      try {
        const authHeader = req.headers['x-sync-token'] || req.headers['authorization'];
        const requiredToken = process.env.TESSERA_SYNC_TOKEN;
        if (requiredToken && authHeader !== requiredToken && authHeader !== `Bearer ${requiredToken}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid sync token' }));
          return;
        }

        const body = await parseJsonBody(req);
        const { clientDigest, clientBook, lastSyncDigest } = body;
        const currentSnap = store.snapshot();

        if (clientDigest && clientDigest === currentSnap.digest) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'in-sync',
            digest: currentSnap.digest,
            conflictCount: 0
          }));
          return;
        }

        const { mergedBook, conflictCount, changed } = mergeNotebooks(
          currentSnap.book,
          clientBook || { notes: [], topics: [], canvasPositions: {} },
          lastSyncDigest,
          currentSnap.digest
        );

        let finalDigest = currentSnap.digest;
        let finalBook = currentSnap.book;

        if (changed) {
          const saved = store.saveBook(mergedBook);
          finalDigest = saved.digest;
          finalBook = saved.book;
          broadcastSSE(saved);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: changed ? (conflictCount > 0 ? 'merged-with-conflicts' : 'updated') : 'in-sync',
          digest: finalDigest,
          book: finalBook,
          conflictCount
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      });
      res.write(': heartbeat\n\n');
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // Static file serving
    let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.normalize(path.join(__dirname, relativePath));

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  };

  const server = http.createServer(handler);

  return { server, handler, store, sseClients, broadcastSSE, notebookPath };
}

if (require.main === module) {
  const PORT = process.env.PORT || '3000';
  const HOST = process.env.HOST || '0.0.0.0';

  const { server, sseClients, notebookPath } = createServerApp();
  console.log(`[Tessera Server] Notebook loaded from: ${notebookPath}`);

  if (isNaN(Number(PORT))) {
    server.listen(PORT, () => {
      console.log(`[Tessera Server] Running on socket: ${PORT}`);
    });
  } else {
    server.listen(Number(PORT), HOST, () => {
      console.log(`[Tessera Server] Running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
    });
  }

  function shutdown() {
    console.log('\n[Tessera Server] Shutting down...');
    for (const client of sseClients) {
      try { client.end(); } catch {}
    }
    server.close(() => {
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServerApp, resolveDefaultDataPath };
