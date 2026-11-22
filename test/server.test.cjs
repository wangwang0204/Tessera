const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

test('Web 伺服器模組結構與 API 處理邏輯正常', async () => {
  const tmpDir = path.join(__dirname, '..', 'work', 'test-web-server');
  fs.mkdirSync(tmpDir, { recursive: true });
  const testDataFile = path.join(tmpDir, 'notebook.json');
  if (fs.existsSync(testDataFile)) fs.unlinkSync(testDataFile);

  const { createServerApp } = require('../server.cjs');
  const { handler, store } = createServerApp({ dataPath: testDataFile });

  assert.ok(store);
  const snap = store.snapshot();
  assert.ok(snap.book);
  assert.ok(snap.digest);

  // Mock request helper
  function mockRequest(method, url, body = null) {
    return new Promise(resolve => {
      const req = new EventEmitter();
      req.method = method;
      req.url = url;
      req.headers = { host: 'localhost:3000' };

      const res = {
        statusCode: 200,
        headers: {},
        body: '',
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(code, h = {}) { this.statusCode = code; Object.assign(this.headers, h); },
        end(data) { if (data) this.body += data; resolve(this); },
        write(data) { this.body += data; }
      };

      handler(req, res);

      if (body) {
        req.emit('data', Buffer.from(body));
      }
      req.emit('end');
    });
  }

  // 1. Health check
  const healthRes = await mockRequest('GET', '/api/health');
  assert.equal(healthRes.statusCode, 200);
  assert.equal(JSON.parse(healthRes.body).status, 'ok');

  // 2. Snapshot API
  const snapRes = await mockRequest('GET', '/api/snapshot');
  assert.equal(snapRes.statusCode, 200);
  const snapData = JSON.parse(snapRes.body);
  assert.equal(snapData.digest, snap.digest);

  // 3. Mutate API
  const mutateRes = await mockRequest('POST', '/api/mutate', JSON.stringify({
    action: 'create',
    payload: { content: '# 測試主題\n## 測試條目\n內容' }
  }));
  assert.equal(mutateRes.statusCode, 200);
  const mutated = JSON.parse(mutateRes.body);
  assert.equal(mutated.book.notes.length, 1);

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
