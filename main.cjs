const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { NotebookStore } = require('./store.cjs');
const { headerTitle } = require('./model.cjs');
const { SyncClient } = require('./sync-client.cjs');
let store, mainWindow, syncClient;
const floating = new Map();
const dataPath = process.env.MY_NOTES_DATA_FILE || path.join(os.homedir(), 'Library', 'Application Support', 'Tessera', 'notebook.json');
if (process.env.MY_NOTES_USER_DATA_DIR) app.setPath('userData', process.env.MY_NOTES_USER_DATA_DIR);
const floatingWidth = 300, collapsedHeight = 15, expandedHeight = 330;
function broadcast(snapshot) {
  for (const window of [mainWindow, ...floating.values()]) if (window && !window.isDestroyed()) window.webContents.send('notebook:update', snapshot);
}
function allowedSender(event) {
  if (![mainWindow, ...floating.values()].some(window => window && !window.isDestroyed() && window.webContents === event.sender)) throw new Error('不允許的視窗');
}
function protect(window) {
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.meta && !input.shift && !input.alt && !input.control && ['r','o'].includes(input.key.toLowerCase())) {
      event.preventDefault();
      window.webContents.send('app:command', input.key.toLowerCase() === 'r' ? 'collapse' : 'timeline');
    }
  });
}
function command(name) {
  if (name === 'sync-now') { syncClient?.syncNow(); return; }
  let target = BrowserWindow.getFocusedWindow() || mainWindow;
  if (name === 'float-note') { if (target !== mainWindow && ![...floating.values()].includes(target)) target = mainWindow; target?.webContents.send('app:command', 'float'); return; }
  if (target !== mainWindow && ['new','new-topic','canvas','timeline','master','split','todos','search','restore'].includes(name)) { if (!mainWindow) main(); mainWindow.show(); mainWindow.focus(); target = mainWindow; }
  if (target && !target.isDestroyed()) target.webContents.send('app:command', name);
}
function main() {
  mainWindow = new BrowserWindow({ width: 1360, height: 900, minWidth: 800, minHeight: 560, title: 'Tessera', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  protect(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    for (const [id, position] of Object.entries(store.book.positions)) {
      if (position.open && store.book.notes.some(note => note.id === id)) openFloating(id);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}
function openFloating(id) {
  const note = store.read().notes.find(n => n.id === id);
  if (!note) throw new Error('找不到便利貼');
  const old = floating.get(id); if (old && !old.isDestroyed()) { old.show(); old.focus(); return; }
  const saved = store.book.positions[id] || {};
  const width = Math.max(floatingWidth, Math.round(saved.width || floatingWidth));
  const height = saved.collapsed ? collapsedHeight : Math.max(220, Math.round(saved.height || saved.expandedContentHeight || expandedHeight));
  const options = { width, height, minWidth: floatingWidth, minHeight: saved.collapsed ? collapsedHeight : 220, frame: false, transparent: true, roundedCorners: false, hasShadow: false, resizable: !saved.collapsed, backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: false, title: headerTitle(note.content, store.book.topics.find(topic => topic.id === note.topicID)), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } };
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) { options.x = Math.round(saved.x); options.y = Math.round(saved.y); }
  const window = new BrowserWindow(options);
  protect(window);
  const notifyFocus = () => { if (!window.isDestroyed()) window.webContents.send('floating:focus', BrowserWindow.getFocusedWindow() === window); };
  window.on('focus', notifyFocus);
  window.on('blur', notifyFocus);
  app.on('browser-window-focus', notifyFocus);
  app.on('browser-window-blur', notifyFocus);
  window.webContents.on('did-finish-load', notifyFocus);
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(path.join(__dirname, 'index.html'), { query: { floating: id } });
  floating.set(id, window);
  window.on('move', () => saveFloatingBounds(id, window));
  window.on('resize', () => saveFloatingBounds(id, window));
  window.on('closed', () => { app.off('browser-window-focus', notifyFocus); app.off('browser-window-blur', notifyFocus); floating.delete(id); try { const pos = store.book.positions[id] || {}; broadcast(store.mutate('floating', { id, position: { ...pos, open: false } })); } catch {} });
  broadcast(store.mutate('floating', { id, position: { ...saved, ...window.getBounds(), open: true, collapsed: !!saved.collapsed } }));
}
const boundTimers = new Map();
function saveFloatingBounds(id, window) {
  clearTimeout(boundTimers.get(id));
  boundTimers.set(id, setTimeout(() => {
    if (window.isDestroyed()) return;
    try { const previous = store.book.positions[id] || {}; broadcast(store.mutate('floating', { id, position: { ...previous, ...window.getBounds(), open: true } })); } catch {}
  }, 180));
}
function menu() {
  const item = (label, accelerator, action) => ({ label, accelerator, click: () => command(action) });
  const template = [
    { label: 'Tessera', submenu: [{ role: 'about' }, { role: 'hide' }, { role: 'quit' }] },
    { label: '檔案', submenu: [item('新增便利貼', 'CmdOrCtrl+N', 'new'), item('新增主題', 'CmdOrCtrl+Shift+N', 'new-topic'), { label: '開啟懸浮便利貼', click: () => command('float-note') }, { type: 'separator' }, item('立即同步筆記', 'CmdOrCtrl+Shift+S', 'sync-now'), { type: 'separator' }, item('刪除選取的便利貼', 'CmdOrCtrl+W', 'delete'), { label:'還原最近刪除的便利貼', click:()=>command('restore') }] },
    { label: '編輯', submenu: [{ role: 'undo' }, { role: 'redo' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, item('粗體', 'CmdOrCtrl+B', 'bold'), item('斜體', 'CmdOrCtrl+I', 'italic'), item('底線', 'CmdOrCtrl+U', 'underline'), item('刪除線', 'CmdOrCtrl+S', 'strike'), item('切換核取方塊', 'CmdOrCtrl+Shift+T', 'checkbox'), { type:'separator' }, item('筆記底色…', 'Alt+C', 'color'), item('套用上次使用的底色', 'Alt+Shift+C', 'repeat-color')] },
    { label: '檢視', submenu: [item('畫布', 'CmdOrCtrl+P', 'canvas'), { label: 'Timeline（⌘O）', click: () => command('timeline') }, item('Timeline（另一組快捷鍵）', 'CmdOrCtrl+2', 'timeline'), item('Master Notes', 'CmdOrCtrl+K', 'master'), item('所有待辦', 'CmdOrCtrl+T', 'todos'), item('Timeline／Master Notes 分割畫面', 'CmdOrCtrl+\\', 'split'), item('搜尋', 'CmdOrCtrl+F', 'search'), { label: '收合／展開便利貼（⌘R）', click: () => command('collapse') }, item('放大畫布', 'CmdOrCtrl+Plus', 'zoom-in'), item('縮小畫布', 'CmdOrCtrl+-', 'zoom-out'), item('放大時間軸', 'Ctrl+Plus', 'timeline-zoom-in'), item('縮小時間軸', 'Ctrl+-', 'timeline-zoom-out')] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
app.whenReady().then(() => {
  try { store = new NotebookStore(dataPath); } catch (error) { require('electron').dialog.showErrorBox('無法開啟 Tessera 資料', error.message); app.quit(); return; }
  ipcMain.handle('notebook:snapshot', event => { allowedSender(event); return store.snapshot(); });
  ipcMain.handle('notebook:mutate', (event, action, payload, digest) => {
    allowedSender(event);
    const next = store.mutate(action, payload, digest);
    broadcast(next);
    syncClient?.scheduleDebouncedSync(1500);
    return next;
  });
  ipcMain.handle('notebook:sync-now', () => syncClient?.syncNow());
  ipcMain.handle('window:open-floating', (event, id) => { allowedSender(event); return openFloating(id); });
  ipcMain.handle('window:note-menu', (event, id) => {
    allowedSender(event);
    if (event.sender !== mainWindow?.webContents || !store.book.notes.some(note => note.id === id)) return;
    const target = mainWindow;
    const send = action => target.webContents.send('note:context-action', { id, action });
    const collapsed = !!store.book.canvasPositions[id]?.collapsed;
    Menu.buildFromTemplate([
      { label: collapsed ? '展開' : '收合', click: () => send('collapse') },
      { label: '開啟懸浮視窗', click: () => send('float') },
      { type: 'separator' },
      { label: '筆記底色…', click: () => send('color') },
      { type: 'separator' },
      { label: '刪除便利貼', click: () => send('delete') }
    ]).popup({ window: target });
  });
  ipcMain.handle('window:close-floating', event => { allowedSender(event); if (event.sender !== mainWindow?.webContents) BrowserWindow.fromWebContents(event.sender)?.close(); });
  ipcMain.on('window:move-floating', (event, dx, dy) => {
    allowedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window === mainWindow || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = window.getPosition();
    window.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.handle('window:main-command', (event, name) => { allowedSender(event); if (!['new','new-topic','canvas','timeline','master','split','todos','search','restore'].includes(name)) return; if (!mainWindow) main(); mainWindow.show(); mainWindow.focus(); if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('app:command', name)); else mainWindow.webContents.send('app:command', name); });
  ipcMain.handle('window:collapse-floating', (event, value) => {
    allowedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) return;
    const id = [...floating].find(([, w]) => w === window)?.[0]; if (!id) return;
    const previous = store.book.positions[id] || {}, bounds = window.getBounds();
    const next = typeof value === 'boolean' ? value : bounds.height > collapsedHeight + 4;
    const restoredHeight = Math.max(220, previous.expandedContentHeight || expandedHeight);
    window.setMinimumSize(floatingWidth, next ? collapsedHeight : 220);
    window.setResizable(!next);
    window.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: next ? collapsedHeight : restoredHeight });
    broadcast(store.mutate('floating', { id, position: { ...previous, ...window.getBounds(), collapsed: next, expandedContentHeight: next ? bounds.height : restoredHeight, open: true } }));
    window.focus();
  });
  syncClient = new SyncClient(store, snapshot => broadcast(snapshot));
  syncClient.startAutoSync(60000);
  menu(); main();
  app.on('activate', () => { if (!mainWindow) main(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
