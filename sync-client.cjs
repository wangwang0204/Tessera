const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function loadSyncConfig(customPath) {
  const defaultPath = path.join(os.homedir(), 'Library', 'Application Support', 'Tessera', 'sync.json');
  const filePath = customPath || process.env.TESSERA_SYNC_CONFIG || defaultPath;

  let fileConfig = {};
  if (fs.existsSync(filePath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn('[SyncClient] Failed to parse sync config file:', err.message);
    }
  }

  return {
    syncUrl: process.env.TESSERA_SYNC_URL || fileConfig.syncUrl || '',
    syncToken: process.env.TESSERA_SYNC_TOKEN || fileConfig.syncToken || '',
    cfClientId: process.env.CF_ACCESS_CLIENT_ID || fileConfig.cfClientId || fileConfig.client_id || fileConfig['CF-Access-Client-Id'] || fileConfig['client-id'] || '',
    cfClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || fileConfig.cfClientSecret || fileConfig.client_secret || fileConfig['CF-Access-Client-Secret'] || fileConfig['client-secret'] || '',
    enabled: Boolean(process.env.TESSERA_SYNC_URL || fileConfig.syncUrl)
  };
}

class SyncClient {
  constructor(store, onUpdate, options = {}) {
    this.store = store;
    this.onUpdate = onUpdate || (() => {});
    this.config = options.config || loadSyncConfig(options.configPath);
    this.lastSyncDigest = null;
    this.isSyncing = false;
    this.timer = null;
    this.debounceTimer = null;
  }

  async syncNow() {
    if (!this.config.syncUrl || this.isSyncing) return null;
    this.isSyncing = true;

    try {
      const snap = this.store.snapshot();
      const payload = JSON.stringify({
        clientDigest: snap.digest,
        clientBook: snap.book,
        lastSyncDigest: this.lastSyncDigest
      });

      const parsedUrl = new URL('/api/sync', this.config.syncUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const requestLib = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      };

      if (this.config.syncToken) {
        headers['X-Sync-Token'] = this.config.syncToken;
      }
      if (this.config.cfClientId && this.config.cfClientSecret) {
        headers['CF-Access-Client-Id'] = this.config.cfClientId;
        headers['CF-Access-Client-Secret'] = this.config.cfClientSecret;
      }

      const resData = await new Promise((resolve, reject) => {
        const req = requestLib.request(parsedUrl, { method: 'POST', headers }, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error(`Failed to parse sync response: ${e.message}`));
              }
            } else {
              reject(new Error(`Sync server responded with HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
          req.destroy(new Error('Sync request timed out'));
        });
        req.write(payload);
        req.end();
      });

      if (resData.status === 'in-sync') {
        this.lastSyncDigest = resData.digest;
        return { status: 'in-sync', digest: resData.digest };
      }

      if (resData.book) {
        const saved = this.store.saveBook(resData.book);
        this.lastSyncDigest = saved.digest;
        this.onUpdate(saved);
        return {
          status: resData.status,
          digest: saved.digest,
          conflictCount: resData.conflictCount || 0
        };
      }

      return resData;
    } catch (err) {
      console.warn('[SyncClient] Sync failed:', err.message);
      return { status: 'error', error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  scheduleDebouncedSync(delayMs = 2000) {
    if (!this.config.syncUrl) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncNow().catch(() => {});
    }, delayMs);
  }

  startAutoSync(intervalMs = 60000) {
    if (!this.config.syncUrl) return;
    // Initial sync
    setTimeout(() => this.syncNow().catch(() => {}), 1000);
    // Periodic interval
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.syncNow().catch(() => {});
    }, intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.debounceTimer);
    this.timer = null;
    this.debounceTimer = null;
  }
}

module.exports = { SyncClient, loadSyncConfig };
