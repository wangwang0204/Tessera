const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { mergeNotebooks } = require('../sync-merge.cjs');
const { createServerApp } = require('../server.cjs');
const { SyncClient } = require('../sync-client.cjs');
const { initialNotebook, createNote } = require('../model.cjs');

test('Sync Engine - mergeNotebooks 演算法正確處理雙向變更與衝突', () => {
  const baseBook = initialNotebook();
  createNote(baseBook, { content: '# 工作\n## 原有筆記\n原始內容' });

  // 1. 完全無變更時
  const res1 = mergeNotebooks(baseBook, baseBook, 'd1', 'd1');
  assert.equal(res1.changed, false);
  assert.equal(res1.conflictCount, 0);

  // 2. Client 端新增一筆筆記
  const clientBook = structuredClone(baseBook);
  createNote(clientBook, { content: '# 生活\n## 購物清單\n牛奶' });
  const res2 = mergeNotebooks(baseBook, clientBook, 'd1', 'd1');
  assert.equal(res2.changed, true);
  assert.equal(res2.mergedBook.notes.length, 2);
  assert.ok(res2.mergedBook.notes.some(n => n.content.includes('購物清單')));

  // 3. 離線衝突測試：兩端同時修改同一張筆記
  const serverConcurrent = structuredClone(baseBook);
  const clientConcurrent = structuredClone(baseBook);
  const noteID = baseBook.notes[0].id;

  serverConcurrent.notes[0].content = '# 工作\n## 原有筆記\n雲端改動內容';
  serverConcurrent.notes[0].updatedAt = '2026-11-23T01:00:00.000Z';

  clientConcurrent.notes[0].content = '# 工作\n## 原有筆記\n桌面改動內容';
  clientConcurrent.notes[0].updatedAt = '2026-11-23T01:05:00.000Z'; // Client 較新

  const res3 = mergeNotebooks(serverConcurrent, clientConcurrent, 'd_old', 'd_server_now');
  assert.equal(res3.changed, true);
  assert.equal(res3.conflictCount, 1);
  // 合併後應有 2 張筆記（1 張採納較新的桌面版，1 張為雲端保留的衝突副本）
  assert.equal(res3.mergedBook.notes.length, 2);
  assert.ok(res3.mergedBook.notes.some(n => n.content === '# 工作\n## 原有筆記\n桌面改動內容'));
  assert.ok(res3.mergedBook.notes.some(n => n.source.includes('同步衝突副本')));
});

test('Sync API - /api/sync 端點運作正常', async () => {
  const tmpDir = path.join(__dirname, '..', 'work', 'test-sync-server');
  fs.mkdirSync(tmpDir, { recursive: true });
  const testDataFile = path.join(tmpDir, 'notebook.json');
  if (fs.existsSync(testDataFile)) fs.unlinkSync(testDataFile);

  const { handler, store } = createServerApp({ dataPath: testDataFile });

  function mockRequest(method, url, body = null, headers = {}) {
    return new Promise(resolve => {
      const req = new EventEmitter();
      req.method = method;
      req.url = url;
      req.headers = { host: 'localhost:3000', ...headers };

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

      if (body) req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  }

  // 1. 同步初始狀態 (in-sync)
  const initialSnap = store.snapshot();
  const res1 = await mockRequest('POST', '/api/sync', JSON.stringify({
    clientDigest: initialSnap.digest,
    clientBook: initialSnap.book
  }));
  assert.equal(res1.statusCode, 200);
  assert.equal(JSON.parse(res1.body).status, 'in-sync');

  // 2. Client 端推送新筆記
  const clientBookWithNewNote = structuredClone(initialSnap.book);
  createNote(clientBookWithNewNote, { content: '# 同步測試\n內容' });

  const res2 = await mockRequest('POST', '/api/sync', JSON.stringify({
    clientDigest: 'd_client_modified',
    clientBook: clientBookWithNewNote,
    lastSyncDigest: initialSnap.digest
  }));
  assert.equal(res2.statusCode, 200);
  const data2 = JSON.parse(res2.body);
  assert.equal(data2.status, 'updated');
  assert.equal(data2.book.notes.length, 1);
  assert.ok(data2.digest !== initialSnap.digest);

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
