const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'bin', 'tessera.cjs');

function run(data, ...args) {
  return execFileSync(process.execPath, [cli, '--data', data, ...args], { encoding: 'utf8' });
}

test('CLI 可以新增、搜尋、顯示與列出便利貼', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-cli-'));
  const data = path.join(dir, 'notebook.json');
  try {
    const added = JSON.parse(run(data, '--json', 'add', '--topic', '工作', '--content', '整理提案'));
    assert.equal(added.topic, '工作');
    assert.match(added.content, /^# 工作\n整理提案$/);
    assert.equal(JSON.parse(run(data, '--json', 'list')).length, 1);
    assert.equal(JSON.parse(run(data, '--json', 'search', '提案'))[0].id, added.id);
    assert.equal(JSON.parse(run(data, '--json', 'show', added.id)).title, '整理提案');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI 可以列出未完成待辦', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-cli-'));
  const data = path.join(dir, 'notebook.json');
  try {
    run(data, 'add', '--content', '- [ ] 第一項\n- [x] 已完成');
    const todos = JSON.parse(run(data, '--json', 'todo'));
    assert.equal(todos.length, 1);
    assert.equal(todos[0].title, '第一項');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI 可以輸出 zsh 補全腳本', () => {
  const output = execFileSync(process.execPath, [cli, 'completion', 'zsh'], { encoding: 'utf8' });
  assert.match(output, /_tessera_note_ids/);
  assert.match(output, /便利貼 ID/);
});
