const test = require('node:test');
const assert = require('node:assert/strict');
const { align } = require('../canvas-align.js');

test('畫布卡片可停在任意座標，接近其他卡片才吸附', () => {
  const other = { x: 400, y: 200, width: 292, height: 220 };
  const moving = { x: 77, y: 91, width: 292, height: 220 };
  assert.deepEqual(align(moving, [other]), { x: 77, y: 91 });
  assert.deepEqual(align({ ...moving, x: 407, y: 231 }, [other]), { x: 400, y: 231 });
  assert.deepEqual(align({ ...moving, x: 701, y: 91 }, [other]), { x: 708, y: 91 });
});
