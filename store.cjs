const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureShape, initialNotebook, createNote, firstTopic, resolveTopic, setTopic, COLORS, isoNow } = require('./model.cjs');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
class NotebookStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initialNotebook(), null, 2));
    this.read();
  }
  read() {
    const bytes = fs.readFileSync(this.file);
    this.book = ensureShape(JSON.parse(bytes)); this.digest = hash(bytes);
    return structuredClone(this.book);
  }
  snapshot() { return { book: this.read(), digest: this.digest }; }
  mutate(action, payload = {}, expectedDigest) {
    const current = fs.readFileSync(this.file);
    if (hash(current) !== this.digest) { this.read(); throw new Error('資料檔已由其他程式修改，畫面已重新載入；請重試操作。'); }
    if (expectedDigest && expectedDigest !== this.digest) throw new Error('畫面資料已更新，請重試操作。');
    const book = structuredClone(this.book);
    let result;
    const note = () => { const found = book.notes.find(n => n.id === payload.id); if (!found) throw new Error('找不到便利貼'); return found; };
    switch (action) {
      case 'create': result = createNote(book, payload); break;
      case 'content': {
        const target = note();
        if (payload.revision !== (target.contentRevision || 0)) throw new Error('這張便利貼已在其他視窗修改，請重新載入。');
        const previousHeading = firstTopic(target.content);
        target.content = String(payload.content);
        target.contentRevision = (target.contentRevision || 0) + 1;
        const heading = firstTopic(target.content);
        if (heading) target.topicID = resolveTopic(book, heading);
        else if (previousHeading) target.topicID = null;
        target.updatedAt = isoNow(); result = target; break;
      }
      case 'conflict-copy': {
        const original = note();
        const copy = createNote(book, { content: String(payload.content) });
        copy.source = '編輯衝突副本'; copy.backgroundStyle = original.backgroundStyle; copy.backgroundHex = original.backgroundHex;
        if (!firstTopic(copy.content)) copy.topicID = original.topicID;
        result = copy; break;
      }
      case 'topic': { const target = note(); if (payload.topicID && !book.topics.some(t => t.id === payload.topicID)) throw new Error('找不到主題'); setTopic(book, target, payload.topicID || null); result = target; break; }
      case 'topic-create': {
        const name = String(payload.name || '').trim(); if (!name) throw new Error('請輸入主題名稱');
        result = resolveTopic(book, name); break;
      }
      case 'position': { note(); book.canvasPositions[payload.id] = { ...(book.canvasPositions[payload.id] || {}), ...payload.position }; break; }
      case 'floating': { note(); book.positions[payload.id] = { ...(book.positions[payload.id] || {}), ...payload.position, floating: true }; break; }
      case 'color': {
        const target = note(), color = String(payload.color);
        if (COLORS.includes(color)) { target.backgroundStyle = color; target.backgroundHex = null; }
        else if (/^#[0-9a-fA-F]{6}$/.test(color)) { target.backgroundHex = color.toUpperCase(); target.backgroundStyle = null; }
        else throw new Error('無效的筆記顏色');
        book.lastUsedNoteColor = color; result = target; break;
      }
      case 'delete': {
        const target = note();
        book.deletedNotes.push({ note: target, floatingPosition: book.positions[target.id], canvasPosition: book.canvasPositions[target.id] });
        book.notes = book.notes.filter(n => n.id !== target.id); delete book.positions[target.id]; delete book.canvasPositions[target.id]; break;
      }
      case 'restore': {
        const record = book.deletedNotes.pop(); if (!record) break;
        book.notes.push(record.note);
        if (record.floatingPosition) book.positions[record.note.id] = { ...record.floatingPosition, open: false };
        if (record.canvasPosition) book.canvasPositions[record.note.id] = record.canvasPosition;
        result = record.note; break;
      }
      case 'year': { const year = Number(payload.year); book.timelineYear = Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null; break; }
      default: throw new Error('未知操作');
    }
    const backup = `${this.file}.before-electron`;
    if (!fs.existsSync(backup)) fs.copyFileSync(this.file, backup);
    // Swift's JSONEncoder stores UUID-keyed dictionaries as alternating key/value arrays.
    // Keep that on-disk format so either app can reopen positions written by Electron.
    const saved = { ...book,
      positions: Object.entries(book.positions).flat(),
      canvasPositions: Object.entries(book.canvasPositions).flat() };
    const next = Buffer.from(JSON.stringify(saved, null, 2) + '\n');
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, next); fs.renameSync(temp, this.file);
    this.book = book; this.digest = hash(next);
    return { book: structuredClone(book), digest: this.digest, result };
  }
}
module.exports = { NotebookStore };
