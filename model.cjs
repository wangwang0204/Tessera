const { randomUUID } = require('node:crypto');
const { visibleTitle, headerTitle } = require('./note-header.js');

const COLORS = ['paper', 'gray', 'warm', 'blue', 'sage', 'rose', 'lavender'];
const DEFAULT_YEAR = null;
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function firstTopic(content) {
  let fence = null;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (fence) { if (line.startsWith(fence)) fence = null; continue; }
    if (line.startsWith('```') || line.startsWith('~~~')) { fence = line.slice(0, 3); continue; }
    const match = /^#\s+(.+)$/.exec(line);
    if (match) return match[1].trim();
  }
  return null;
}
function parseDate(text, year) {
  const m = /(?<!\d)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?(?!\d)/.exec(text);
  if (!m) return null;
  const parts = m[1].split(/[-/]/).map(Number);
  const y = parts.length === 3 ? parts[0] : year;
  if (!y) return { missingYear: true, raw: m[0] };
  const month = parts.at(-2), day = parts.at(-1), hour = Number(m[2] || 0), minute = Number(m[3] || 0);
  const date = new Date(y, month - 1, day, hour, minute);
  if (date.getFullYear() !== y || date.getMonth() !== month - 1 || date.getDate() !== day || hour > 23 || minute > 59) return { invalid: true, raw: m[0] };
  return { date: date.toISOString(), raw: m[0], precision: m[2] ? 'minute' : 'day', assumedYear: parts.length === 2 ? y : null };
}
function parseNotebook(book) {
  const records = [], topics = new Map((book.topics || []).map(t => [t.id, t]));
  const issues = [];
  for (const note of book.notes || []) {
    if (note.archived) continue;
    let topic = topics.get(note.topicID)?.name || '收件匣', item = null, year = book.timelineYear ?? DEFAULT_YEAR;
    let fence = null, front = false;
    const lines = (note.content || '').split('\n');
    if (lines[0]?.trim() === '---') {
      const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)$/.test(line.trim()));
      if (end > 0) {
        const yaml = lines.slice(1, end).find(line => /^year:\s*/i.test(line));
        if (yaml) year = Number(yaml.split(':')[1].trim()) || year;
        front = end;
      }
    }
    for (let index = 0; index < lines.length; index++) {
      if (front !== false && index <= front) continue;
      const raw = lines[index], line = raw.trim();
      if (fence) { if (line.startsWith(fence)) fence = null; continue; }
      if (line.startsWith('```') || line.startsWith('~~~')) { fence = line.slice(0, 3); continue; }
      const directive = /^@year\s+(\d{4})$/.exec(line);
      if (directive) { year = Number(directive[1]); continue; }
      if (/^#\s+/.test(line)) { topic = line.slice(2).trim() || topic; item = null; continue; }
      if (/^##\s+/.test(line)) { item = line.slice(3).trim() || null; continue; }
      if (!line || /^#{3,6}\s+/.test(line)) continue;
      const list = /^\s*([-+*]|\d+[.)])\s+/.exec(raw);
      const body = list ? raw.slice(list[0].length) : line;
      const checkbox = /^\[([ xX])\]\s*/.exec(body);
      const content = checkbox ? body.slice(checkbox[0].length) : body;
      const suffix = /\s+##\s+(.+?)\s*$/.exec(content);
      const recordItem = suffix ? suffix[1] : item;
      const stamp = parseDate(content, year);
      if (stamp?.missingYear || stamp?.invalid) issues.push({ noteID: note.id, line: index + 1, reason: stamp.missingYear ? '缺少年份' : '日期無效' });
      records.push({ id: `${note.id}:${index + 1}`, noteID: note.id, line: index + 1, topic, item: recordItem, raw, content, checkbox: checkbox ? checkbox[1].toLowerCase() === 'x' : null, timestamp: stamp?.date || null, precision: stamp?.precision || null, rawTimestamp: stamp?.raw || null });
    }
  }
  return { records, events: records.filter(r => r.timestamp).sort((a,b) => a.timestamp.localeCompare(b.timestamp)), issues };
}
function initialNotebook() { return { schemaVersion: 1, topics: [], notes: [], positions: {}, canvasPositions: {}, deletedNotes: [], timelineYear: null }; }
function positionMap(value) {
  if (Array.isArray(value)) {
    if (value.length % 2) throw new Error('便利貼位置資料格式錯誤');
    const result = {};
    for (let index = 0; index < value.length; index += 2) {
      if (typeof value[index] !== 'string' || !value[index + 1] || typeof value[index + 1] !== 'object' || Array.isArray(value[index + 1])) throw new Error('便利貼位置資料格式錯誤');
      result[value[index]] = value[index + 1];
    }
    return result;
  }
  if (value && typeof value === 'object') return value;
  return {};
}
function ensureShape(book) {
  if (!book || book.schemaVersion !== 1 || !Array.isArray(book.notes) || !Array.isArray(book.topics)) throw new Error('不支援的 notebook.json 格式');
  book.positions = positionMap(book.positions); book.canvasPositions = positionMap(book.canvasPositions); book.deletedNotes ||= [];
  return book;
}
function resolveTopic(book, name) {
  if (!name || name === '收件匣') return null;
  let topic = book.topics.find(t => t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!topic) { topic = { id: randomUUID().toUpperCase(), name, label: name, createdAt: isoNow() }; book.topics.push(topic); }
  return topic.id;
}
function setTopic(book, note, topicID) {
  const old = firstTopic(note.content), name = book.topics.find(t => t.id === topicID)?.name;
  if (old) {
    const lines = note.content.split('\n'); let fence = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (fence) { if (line.startsWith(fence)) fence = null; continue; }
      if (line.startsWith('```') || line.startsWith('~~~')) { fence = line.slice(0, 3); continue; }
      if (/^#\s+.+$/.test(line)) { if (name) lines[index] = lines[index].replace(/^([ \t]*#\s+).+$/, '$1' + name); else lines.splice(index,1); break; }
    }
    note.content = lines.join('\n');
  } else if (name) note.content = `# ${name}\n${note.content}`;
  note.topicID = topicID;
  note.contentRevision = (note.contentRevision || 0) + 1;
  note.updatedAt = isoNow();
}
function createNote(book, { content = '', topicID = null, x, y } = {}) {
  const heading = firstTopic(content);
  if (heading) topicID = resolveTopic(book, heading);
  else if (topicID) content = `# ${book.topics.find(t => t.id === topicID)?.name || '收件匣'}\n${content}`;
  const now = isoNow();
  const note = { id: randomUUID().toUpperCase(), topicID, content, source: '手動', createdAt: now, updatedAt: now, pinned: false, archived: false, contentRevision: 0, backgroundStyle: book.lastUsedNoteColor && COLORS.includes(book.lastUsedNoteColor) ? book.lastUsedNoteColor : 'paper' };
  book.notes.push(note);
  book.canvasPositions[note.id] = { x: Number.isFinite(x) ? x : 80 + (book.notes.length % 4) * 56, y: Number.isFinite(y) ? y : 80 + (book.notes.length % 5) * 48, width: 292, height: 220, collapsed: false };
  return note;
}
module.exports = { COLORS, isoNow, firstTopic, visibleTitle, headerTitle, parseDate, parseNotebook, initialNotebook, ensureShape, resolveTopic, setTopic, createNote };
