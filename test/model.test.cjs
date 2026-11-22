const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseNotebook, visibleTitle, headerTitle, createNote } = require('../model.cjs');
const { NotebookStore } = require('../store.cjs');

test('Topic / Item / Record 投影保留來源行與年份規則', () => {
  const book={schemaVersion:1,topics:[],notes:[{id:'A',topicID:null,content:'# 工作\n## 發布\n- [ ] 11/05: 初稿\n@year 2026\n- [x] 11/06: 完成 ## 上架\n```\n- 2026-11-07: 範例\n```\n一段 2026-11-08: 回顧',archived:false}],positions:{},canvasPositions:{},timelineYear:null};
  const parsed=parseNotebook(book);
  assert.equal(parsed.issues.length,1);
  assert.equal(parsed.events.length,2);
  assert.deepEqual(parsed.events.map(r=>[r.line,r.topic,r.item,r.checkbox]),[[5,'工作','上架',true],[9,'工作','發布',null]]);
  assert.equal(parsed.records[0].item,'發布');
});
test('標題與建立筆記沿用原生 Note 模型', () => {
  const book={schemaVersion:1,topics:[{id:'T',name:'工作',label:'工作',createdAt:'2026-01-01T00:00:00Z'}],notes:[],positions:{},canvasPositions:{}};
  const n=createNote(book,{content:'整理重點',topicID:'T',x:23,y:42});
  assert.equal(n.content,'# 工作\n整理重點');
  assert.equal(visibleTitle(n.content),'整理重點');
  assert.equal(headerTitle('# 工作\n## 上架\n- 紀錄',{name:'工作'}),'工作  /  上架');
  assert.equal(headerTitle('## 上架\n- 紀錄',{name:'工作'}),'上架');
  assert.equal(headerTitle('# **工作**\n## `上架`\n## `上架`\n# 其他\n## 忽略'),'工作  /  上架');
  assert.equal(headerTitle('```\n# 範例\n## 隱藏\n```\n# 正文\n## 可見'),'正文  /  可見');
  assert.equal(book.canvasPositions[n.id].x,23);
});
test('儲存以原檔備份並拒絕外部覆寫', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'my-notes-electron-'));
  try {
    const file=path.join(dir,'notebook.json');
    const store=new NotebookStore(file);
    const created=store.mutate('create',{content:'hello'});
    assert.ok(fs.existsSync(file+'.before-electron'));
    assert.equal(created.book.notes[0].content,'hello');
    fs.writeFileSync(file,JSON.stringify({...created.book, timelineYear:2027}));
    assert.throws(()=>store.mutate('year',{year:2026}),/其他程式修改/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('Swift 的位置陣列拖動後可保存並重新載入', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'my-notes-swift-positions-'));
  try {
    const file=path.join(dir,'notebook.json');
    const id='BF4E971B-60E9-4CFB-A1AF-B0E6BBCDB4F8';
    fs.writeFileSync(file,JSON.stringify({schemaVersion:1,topics:[],notes:[{id,content:'## 測試',archived:false}],positions:[id,{x:20,y:30,floating:true}],canvasPositions:[id,{x:50,y:60,width:292,height:220,collapsed:false}]}));
    const store=new NotebookStore(file);
    assert.equal(store.book.canvasPositions[id].x,50);
    assert.equal(store.book.positions[id].x,20);
    store.mutate('position',{id,position:{x:145,y:190}});
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.deepEqual(saved.canvasPositions,[id,{x:145,y:190,width:292,height:220,collapsed:false}]);
    assert.deepEqual(saved.positions,[id,{x:20,y:30,floating:true}]);
    assert.deepEqual(new NotebookStore(file).book.canvasPositions[id],{x:145,y:190,width:292,height:220,collapsed:false});
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('編輯保留原主題，衝突內容另存副本且刪除可復原', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'my-notes-electron-'));
  try {
    const file=path.join(dir,'notebook.json'),store=new NotebookStore(file);
    let state=store.mutate('topic-create',{name:'研究'});
    const id=state.result;
    state=store.mutate('create',{content:'第一行',topicID:id});
    const original=state.result;
    assert.match(original.createdAt,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    state=store.mutate('content',{id:original.id,content:'# 研究\n第二行',revision:0});
    assert.equal(state.book.notes[0].topicID,id);
    assert.throws(()=>store.mutate('content',{id:original.id,content:'舊版本',revision:0}),/其他視窗修改/);
    state=store.mutate('conflict-copy',{id:original.id,content:'舊版本'});
    assert.equal(state.result.source,'編輯衝突副本');
    assert.equal(state.result.content,'舊版本');
    assert.equal(state.book.notes.length,2);
    state=store.mutate('delete',{id:original.id});
    assert.equal(state.book.notes.length,1);
    state=store.mutate('restore');
    assert.equal(state.book.notes.length,2);
    assert.equal(state.result.id,original.id);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
