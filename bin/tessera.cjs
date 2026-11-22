#!/usr/bin/env node

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { NotebookStore } = require('../store.cjs');
const { parseNotebook, visibleTitle } = require('../model.cjs');

const defaultDataPath = () => process.env.MY_NOTES_DATA_FILE || path.join(os.homedir(), 'Library', 'Application Support', 'Tessera', 'notebook.json');

function usage() {
  return `Tessera CLI

用法：
  tessera [--data PATH] [--json] list [--limit N]
  tessera [--data PATH] [--json] search QUERY
  tessera [--data PATH] [--json] show NOTE_ID
  tessera [--data PATH] [--json] todo
  tessera [--data PATH] [--json] add --content TEXT [--topic TOPIC]
  tessera completion zsh

全域選項：
  --data PATH  指定 notebook.json；預設為 Tessera 正式資料檔
  --json       以 JSON 輸出，方便腳本使用
  --help       顯示此說明
`;
}

function fail(message) { process.stderr.write(`錯誤：${message}\n`); process.exitCode = 1; }

function parseArgs(argv) {
  const options = { json: false, data: null, limit: 50, topic: null, content: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--json') { options.json = true; continue; }
    if (['--data', '--limit', '--topic', '--content'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 需要一個值`);
      options[arg.slice(2)] = value;
      continue;
    }
    positional.push(arg);
  }
  return { options, command: positional.shift(), args: positional };
}

function noteSummary(book, note) {
  const topic = book.topics.find(item => item.id === note.topicID)?.name || '收件匣';
  return { id: note.id, title: visibleTitle(note.content) || '(無標題)', topic, updatedAt: note.updatedAt, content: note.content };
}

function print(value, json) {
  if (json) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); return; }
  if (Array.isArray(value)) {
    if (!value.length) { process.stdout.write('沒有符合的便利貼。\n'); return; }
    for (const item of value) process.stdout.write(`${item.id}\t${item.topic}\t${item.title}\t${item.updatedAt}\n`);
    return;
  }
  process.stdout.write(`${value.id}\t${value.topic}\t${value.title}\t${value.updatedAt}\n\n${value.content}\n`);
}

function main() {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); } catch (error) { fail(error.message); return; }
  if (parsed.help) { process.stdout.write(usage()); return; }
  const { options, command, args } = parsed;
  if (!command) { process.stdout.write(usage()); return; }

  if (command === 'completion') {
    if (args[0] !== 'zsh' || args[1]) { fail('用法：tessera completion zsh'); return; }
    process.stdout.write(fs.readFileSync(path.join(__dirname, '..', 'completions', 'tessera.zsh'), 'utf8'));
    return;
  }

  const store = new NotebookStore(options.data || defaultDataPath());
  const book = store.read();
  const summaries = () => book.notes.filter(note => !note.archived).map(note => noteSummary(book, note));

  if (command === 'list') {
    const limit = Number(options.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) { fail('--limit 必須是正整數'); return; }
    print(summaries().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit), options.json);
    return;
  }
  if (command === 'search') {
    const query = args.join(' ').trim();
    if (!query) { fail('search 需要關鍵字'); return; }
    const needle = query.toLocaleLowerCase();
    print(summaries().filter(note => `${note.title}\n${note.content}\n${note.topic}`.toLocaleLowerCase().includes(needle)), options.json);
    return;
  }
  if (command === 'show') {
    const id = args[0];
    if (!id) { fail('show 需要 NOTE_ID'); return; }
    const note = summaries().find(item => item.id === id);
    if (!note) { fail('找不到便利貼'); return; }
    print(note, options.json);
    return;
  }
  if (command === 'todo') {
    const records = parseNotebook(book).records.filter(record => record.checkbox === false);
    const rows = records.map(record => ({ id: record.id, noteID: record.noteID, topic: record.topic, title: record.content, line: record.line }));
    if (options.json) { print(rows, true); return; }
    if (!rows.length) { process.stdout.write('沒有未完成待辦。\n'); return; }
    for (const row of rows) process.stdout.write(`${row.noteID}:${row.line}\t${row.topic}\t${row.title}\n`);
    return;
  }
  if (command === 'add') {
    if (args.length) { fail('add 不接受未命名參數；請使用 --content'); return; }
    if (!options.content?.trim()) { fail('add 需要 --content TEXT'); return; }
    const content = options.topic ? `# ${options.topic.trim()}\n${options.content}` : options.content;
    const next = store.mutate('create', { content });
    print(noteSummary(next.book, next.result), options.json);
    return;
  }
  fail(`未知指令：${command}\n\n${usage()}`);
}

try { main(); } catch (error) { fail(error.message); }
