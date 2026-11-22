const test = require('node:test');
const assert = require('node:assert/strict');
const { group } = require('../master-groups.js');

test('Master Notes 依同主題及同 Item 排列，保留各來源', () => {
  const notes = [
    { id: 'a', content: '# Listenfy\n## 約會議\n- 第一張', topicID: null },
    { id: 'b', content: '# DAC\n## 木棉花\n- 第二張', topicID: null },
    { id: 'c', content: '# Listenfy\n## 約會議\n- 第三張', topicID: null },
    { id: 'd', content: '# Listenfy\n## TODO\n- 第四張', topicID: null }
  ];
  const result = group(notes, []);
  assert.deepEqual(result.map(value => value.topic), ['DAC', 'Listenfy']);
  const listenfy = result[1];
  assert.deepEqual(new Set(listenfy.items.map(value => value.item)), new Set(['TODO', '約會議']));
  assert.deepEqual(listenfy.items.find(value => value.item === '約會議').notes.map(value => value.id), ['a', 'c']);
});
