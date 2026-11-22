const $ = selector => document.querySelector(selector);
const floatingID = new URLSearchParams(location.search).get('floating');
const COLORS = { paper:'#FFFFFF',gray:'#F2F2F2',warm:'#FAF7F0',blue:'#EFF5FA',sage:'#F1F7F2',rose:'#FBF2F1',lavender:'#F5F2FA' };
let state, view = 'canvas', selectedID = null, hoveredID = null, mode = 'compact', filter = '', zoom = 1, timelineZoom = 1;
let activeEditor = null;
let searchIndex = -1;
const drafts = new Map(), timers = new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function note(id) { return state?.book.notes.find(n => n.id === id); }
function topicFor(n) { return state.book.topics.find(t => t.id === n.topicID); }
function title(n) { return window.NoteHeader.visibleTitle(n.content); }
function headerTitle(n) { return window.NoteHeader.headerTitle(drafts.get(n.id)?.content ?? n.content); }
function fillHeaderTitle(element, n) {
  const parts = window.NoteHeader.parts(drafts.get(n.id)?.content ?? n.content);
  element.replaceChildren();element.title=parts.full;
  if(parts.topic){const topic=document.createElement('span');topic.className='note-header-topic';topic.textContent=parts.topic+'  /  ';element.append(topic);}
  const label=document.createElement('span');label.textContent=parts.label;element.append(label);
}
function color(n) { return n.backgroundHex || COLORS[n.backgroundStyle] || COLORS.paper; }
function activeNotes() { return state.book.notes.filter(n => !n.archived); }
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3500); }
async function mutate(action, payload={}) {
  try { state = await window.myNotes.mutate(action,payload,action==='position'?undefined:state.digest); refresh(); return state.result; }
  catch(error) { toast(error.message); state=await window.myNotes.snapshot(); refresh(); throw error; }
}
function refresh() {
  if (floatingID) { renderFloating(); return; }
  $('#page-title').textContent={canvas:'畫布',timeline:'Timeline',master:'Master Notes',split:'Timeline / Master Notes',todos:'所有待辦'}[view];
  $('#page-meta').textContent=view==='canvas'?`${activeNotes().length} 則便利貼`:'';
  $('.workspace').classList.toggle('split-mode',view==='split');
  document.querySelectorAll('.nav').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  document.querySelectorAll('.view').forEach(section=>section.classList.toggle('hidden',view==='split' ? !['timeline-view','master-view'].includes(section.id) : section.id!==`${view}-view`));
  $('#new-button').hidden=view!=='canvas';
  $('#zoom-in').hidden=$('#zoom-out').hidden=$('#zoom-value').hidden=view!=='canvas';
  if(view==='canvas') renderCanvas(); else if(view==='timeline') renderTimeline(); else if(view==='master') renderMaster(); else if(view==='split'){renderTimeline();renderMaster();} else if(view==='todos') renderTodos();
}
function setView(next) { view=next; refresh(); }
function select(id) { selectedID=id; document.querySelectorAll('.card').forEach(card=>card.classList.toggle('selected',card.dataset.id===id)); }
function setCanvasZoom(next,clientX,clientY) {
  const scroll=$('#canvas-view'),rect=scroll.getBoundingClientRect();
  const px=clientX-rect.left,py=clientY-rect.top;
  const worldX=(scroll.scrollLeft+px)/zoom,worldY=(scroll.scrollTop+py)/zoom;
  zoom=Math.min(2.5,Math.max(.5,next));
  $('#canvas').style.zoom=String(zoom);
  $('#zoom-value').textContent=`${Math.round(zoom*100)}%`;
  scroll.scrollLeft=worldX*zoom-px;scroll.scrollTop=worldY*zoom-py;
}
function position(n,index) { return state.book.canvasPositions[n.id] || {x:50+(index%4)*312,y:50+Math.floor(index/4)*250,width:292,height:220,collapsed:false}; }
function alignedCanvasPosition(card,x,y) {
  const others=[...$('#canvas').querySelectorAll('.card')].filter(other=>other!==card)
    .map(other=>({x:parseFloat(other.style.left),y:parseFloat(other.style.top),width:other.offsetWidth,height:other.offsetHeight}));
  return window.CanvasAlign.align({x,y,width:card.offsetWidth,height:card.offsetHeight},others);
}
function extendCanvasTo(card) {
  const root=$('#canvas');
  root.style.width=`${Math.max(root.offsetWidth,parseFloat(card.style.left)+card.offsetWidth+160)}px`;
  root.style.height=`${Math.max(root.offsetHeight,parseFloat(card.style.top)+card.offsetHeight+160)}px`;
}
function footer(n) { const records=parseNote(n); const events=records.filter(r=>r.timestamp).length, todos=records.filter(r=>r.checkbox===false).length; return `${events} 筆日期紀錄　·　${todos} 項未完成待辦`; }
function disposeEditors(root) { root.querySelectorAll('textarea.editor-source').forEach(area => { if (activeEditor===area.editorAdapter) activeEditor=null; area.editorAdapter?.destroy(); }); }
function renderCanvas() {
  const root=$('#canvas'); disposeEditors(root); root.replaceChildren();
  root.style.width=`${Math.max(1600,...activeNotes().map((n,i)=>position(n,i).x+position(n,i).width+120))}px`;
  root.style.height=`${Math.max(1100,...activeNotes().map((n,i)=>position(n,i).y+position(n,i).height+120))}px`;
  root.style.zoom=String(zoom); root.style.transform=''; $('#zoom-value').textContent=`${Math.round(zoom*100)}%`;
  activeNotes().forEach((n,index)=>{
    const p=position(n,index), card=document.createElement('article'); card.className=`card${p.collapsed?' collapsed':''}${selectedID===n.id?' selected':''}`;card.dataset.id=n.id;
    card.style.cssText=`left:${p.x}px;top:${p.y}px;width:${p.width||292}px;height:${p.height||220}px;--note-bg:${color(n)}`;
    card.innerHTML=`<header class="card-header"><span class="card-title"></span><div class="card-actions"><button data-action="collapse" title="${p.collapsed?'展開':'收合'}" aria-label="${p.collapsed?'展開':'收合'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${p.collapsed?'M4 6.5 8 10.5 12 6.5':'M4 9.5 8 5.5 12 9.5'}"/></svg></button></div></header><div class="card-body"><textarea class="markdown-editor" spellcheck="false" aria-label="${esc(title(n))} 內容"></textarea><div class="card-footer">${esc(footer(n))}</div></div><div class="resize-handle"></div>`;
    fillHeaderTitle(card.querySelector('.card-title'),n);
    card.querySelector('textarea').value=drafts.get(n.id)?.content ?? n.content;
    card.addEventListener('pointerdown',()=>select(n.id));
    card.addEventListener('pointerenter',()=>{hoveredID=n.id;});
    card.addEventListener('pointerleave',()=>{if(hoveredID===n.id)hoveredID=null;});
    card.querySelector('.card-actions').onclick=e=>{const action=e.target.closest('button')?.dataset.action; if(!action)return; e.stopPropagation(); if(action==='collapse') toggleCollapse(n.id); if(action==='float') window.myNotes.openFloating(n.id); if(action==='color') showColorDialog(n.id); if(action==='delete') deleteSelected(n.id);};
    card.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();select(n.id);window.myNotes.showNoteMenu(n.id);};
    bindDrag(card.querySelector('.card-header'),card,n,p);
    bindResize(card.querySelector('.resize-handle'),card,n,p);
    const editor=bindEditor(card.querySelector('textarea'),n.id);
    card.editorAdapter=editor;
    root.append(card);
  });
  root.oncontextmenu=e=>{if(e.target!==root)return;e.preventDefault();const rect=root.getBoundingClientRect();createAt((e.clientX-rect.left)/zoom,(e.clientY-rect.top)/zoom);};
}
function bindDrag(handle,card,n,p) {
  handle.onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;
    if(handle.draggingPointer!==undefined)return;
    if(e.detail===2){e.preventDefault();select(n.id);toggleCollapse(n.id);return;}
    e.preventDefault();select(n.id);const start={x:e.clientX,y:e.clientY,left:parseFloat(card.style.left),top:parseFloat(card.style.top)};let moved=false;
    handle.draggingPointer=e.pointerId;
    const move=event=>{if(event.pointerId!==e.pointerId)return;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<3&&!moved)return;moved=true;const x=Math.max(0,start.left+(event.clientX-start.x)/zoom),y=Math.max(0,start.top+(event.clientY-start.y)/zoom);card.style.left=`${x}px`;card.style.top=`${y}px`;extendCanvasTo(card);};
    const finish=event=>{if(event.pointerId!==e.pointerId)return;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);delete handle.draggingPointer;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);if(moved){const aligned=alignedCanvasPosition(card,parseFloat(card.style.left),parseFloat(card.style.top));card.style.left=`${aligned.x}px`;card.style.top=`${aligned.y}px`;mutate('position',{id:n.id,position:aligned}).catch(()=>{});}};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
    handle.setPointerCapture(e.pointerId);
  };
}
function bindResize(handle,card,n,p) {
  handle.onpointerdown=e=>{e.stopPropagation();e.preventDefault();const start={x:e.clientX,y:e.clientY,width:p.width||292,height:p.height||220};handle.setPointerCapture(e.pointerId);
    handle.onpointermove=event=>{card.style.width=`${Math.max(220,start.width+(event.clientX-start.x)/zoom)}px`;card.style.height=`${Math.max(160,start.height+(event.clientY-start.y)/zoom)}px`;};
    handle.onpointerup=()=>{handle.onpointermove=null;handle.onpointerup=null;mutate('position',{id:n.id,position:{width:Math.round(parseFloat(card.style.width)),height:Math.round(parseFloat(card.style.height))}}).catch(()=>{});};
  };
}
function bindEditor(textarea,id) {
  let editor;
  editor=window.mountMarkdownEditor(textarea,{
    onInput:()=>{const draft=drafts.get(id)||{revision:note(id)?.contentRevision||0};draft.content=editor.value; drafts.set(id,draft);$('#save-status').textContent='儲存中…';clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>saveDraft(id),450));},
    onFocus:()=>{activeEditor=editor;if(!floatingID)select(id);},
    onBlur:()=>{if(activeEditor===editor)activeEditor=null;if(drafts.has(id))saveDraft(id);},
    onKeydown:(event,adapter)=>editorKeydown(event,adapter)
  });
  return editor;
}
async function saveDraft(id) {
  const draft=drafts.get(id); if(!draft)return;
  const current=note(id); if(!current || current.content===draft.content){drafts.delete(id);return;}
  const submitted=draft.content;
  try {
    state=await window.myNotes.mutate('content',{id,content:submitted,revision:draft.revision},state.digest);
    const latest=drafts.get(id);
    if(latest?.content===submitted) drafts.delete(id);
    else if(latest) { latest.revision=state.book.notes.find(n=>n.id===id)?.contentRevision||draft.revision+1; clearTimeout(timers.get(id)); timers.set(id,setTimeout(()=>saveDraft(id),300)); }
    $('#save-status').textContent='已儲存';
    if(!activeEditor)refresh();
  } catch(error) {
    state=await window.myNotes.snapshot();
    try { state=await window.myNotes.mutate('conflict-copy',{id,content:draft.content},state.digest); drafts.delete(id); toast('來源已變更，這次編輯已保存在新的衝突副本'); $('#save-status').textContent='已存為衝突副本'; if(!activeEditor)refresh(); }
    catch { toast(error.message); $('#save-status').textContent='儲存失敗'; }
  }
}
function formatEditor(editor,kind) {
  const a=editor.selectionStart,b=editor.selectionEnd,text=editor.value;
  if(kind==='checkbox') {
    const start=text.lastIndexOf('\n',a-1)+1,end=text.indexOf('\n',a)<0?text.length:text.indexOf('\n',a);
    const line=text.slice(start,end); let replacement;
    if(/^\s*[-+*]\s+\[[ xX]\]/.test(line)) replacement=line.replace(/\[([ xX])\]/,(_m,value)=>value===' '?'[x]':'[ ]');
    else if(/^\s*[-+*]\s+/.test(line)) replacement=line.replace(/^(\s*[-+*]\s+)/,'$1[ ] ');
    else replacement='- [ ] '+line;
    editor.setRangeText(replacement,start,end,'end');
  } else {
    const markers={bold:'**',italic:'*',underline:'<u>',strike:'~~'},mark=markers[kind];
    if(!mark)return;
    const close=kind==='underline'?'</u>':mark;
    const has=a>=mark.length&&text.slice(a-mark.length,a)===mark&&text.slice(b,b+close.length)===close;
    if(has) {editor.setRangeText(text.slice(a,b),a-mark.length,b+close.length,'select');editor.setSelectionRange(a-mark.length,b-mark.length);}
    else {editor.setRangeText(mark+text.slice(a,b)+close,a,b,'select');editor.setSelectionRange(a+mark.length,b+mark.length);}
  }
}
function editorKeydown(e,editor) {
  if(e.key==='Tab') {const a=editor.selectionStart,b=editor.selectionEnd,text=editor.value,start=text.lastIndexOf('\n',a-1)+1;const end=b>start&&text[b-1]==='\n'?b-1:b;const blockEnd=text.indexOf('\n',end)<0?text.length:text.indexOf('\n',end);const block=text.slice(start,blockEnd);if(block.split('\n').every(line=>/^\s*([-+*]|\d+[.)])\s+/.test(line))){e.preventDefault();const updated=block.split('\n').map(line=>e.shiftKey?line.replace(/^ {1,2}/,''):'  '+line).join('\n');editor.setRangeText(updated,start,blockEnd,'select');}return;}
  if(e.key==='Enter'&&!e.metaKey&&!e.ctrlKey) {const a=editor.selectionStart,text=editor.value,start=text.lastIndexOf('\n',a-1)+1,line=text.slice(start,a);const m=/^(\s*)([-+*]|\d+[.)])\s+(\[([ xX])\]\s*)?(.*)$/.exec(line);if(m){e.preventDefault();if(!m[5].trim()){editor.setRangeText('',start,a,'end');}else{const marker=/^\d/.test(m[2])?`${Number(m[2].slice(0,-1))+1}${m[2].at(-1)}`:m[2];editor.setRangeText(`\n${m[1]}${marker} ${m[3]?'[ ] ':''}`,a,a,'end');}}}
}
async function toggleCollapse(id) {const n=note(id),p=state.book.canvasPositions[id]||{};if(floatingID) {await window.myNotes.collapseFloating();return;}await mutate('position',{id:n.id,position:{collapsed:!p.collapsed}}).catch(()=>{});}
let colorTargetID=null;
function showColorDialog(id=floatingID||selectedID) {
  if(!id)return;colorTargetID=id;
  const names={paper:'紙白',gray:'霧灰',warm:'暖紙',blue:'晨藍',sage:'鼠尾草',rose:'淡玫瑰',lavender:'淡薰衣草'};
  $('#color-swatches').innerHTML=Object.entries(COLORS).map(([key,value])=>`<button data-color="${key}" title="${names[key]}"><span style="background:${value}"></span>${names[key]}</button>`).join('');
  $('#color-dialog').showModal();
}
function repeatColor() {const id=floatingID||selectedID,color=state.book.lastUsedNoteColor;if(id&&color)mutate('color',{id,color}).catch(()=>{});}
async function deleteSelected(id=selectedID) {if(!id)return; if(!confirm(`刪除「${title(note(id))}」？`))return;await mutate('delete',{id}).catch(()=>{});if(selectedID===id)selectedID=null;}
async function createAt(x,y) {const result=await mutate('create',{content:'',x,y});selectedID=result.id;setView('canvas');document.querySelector(`.card[data-id="${result.id}"]`)?.editorAdapter?.focus();}
function parseDate(text,year) {const m=/(?<!\d)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?(?!\d)/.exec(text);if(!m)return null;const parts=m[1].split(/[-/]/).map(Number),y=parts.length===3?parts[0]:year;if(!y)return {missingYear:true};const month=parts.at(-2),day=parts.at(-1),hour=Number(m[2]||0),minute=Number(m[3]||0),date=new Date(y,month-1,day,hour,minute);if(date.getFullYear()!==y||date.getMonth()!==month-1||date.getDate()!==day||hour>23||minute>59)return {invalid:true};return {timestamp:date.getTime(),raw:m[0]};}
function parseNote(n) {let topic=topicFor(n)?.name||'收件匣',item=null,year=state.book.timelineYear;let fence=null,front=-1;const lines=n.content.split('\n');if(lines[0]?.trim()==='---'){front=lines.findIndex((line,i)=>i>0&&/^(---|\.\.\.)$/.test(line.trim()));if(front>0){const y=lines.slice(1,front).find(line=>/^year:\s*/i.test(line));if(y)year=Number(y.split(':')[1].trim())||year;}}
  const rows=[];lines.forEach((raw,i)=>{if(front>0&&i<=front)return;const line=raw.trim();if(fence){if(line.startsWith(fence))fence=null;return;}if(line.startsWith('```')||line.startsWith('~~~')){fence=line.slice(0,3);return;}const directive=/^@year\s+(\d{4})$/.exec(line);if(directive){year=Number(directive[1]);return;}if(/^#\s+/.test(line)){topic=line.slice(2).trim();item=null;return;}if(/^##\s+/.test(line)){item=line.slice(3).trim();return;}if(!line||/^#{3,6}\s+/.test(line))return;const body=raw.replace(/^\s*([-+*]|\d+[.)])\s+/,'');const checkbox=/^\[([ xX])\]\s*/.exec(body);const content=checkbox?body.slice(checkbox[0].length):body;const suffix=/\s+##\s+(.+?)\s*$/.exec(content),date=parseDate(content,year);rows.push({noteID:n.id,line:i+1,topic,item:suffix?.[1]||item||'未分類',raw,content,checkbox:checkbox?checkbox[1].toLowerCase()==='x':null,timestamp:date?.timestamp||null,missingYear:date?.missingYear,invalid:date?.invalid,rawTimestamp:date?.raw});});return rows;}
function allRecords() {return activeNotes().flatMap(parseNote);}
function renderTimeline() {
  const records=allRecords(),events=records.filter(record=>record.timestamp).sort((a,b)=>a.timestamp-b.timestamp);
  const issues=records.filter(record=>record.missingYear||record.invalid);
  $('#event-count').textContent=`${events.length} 筆事件${issues.length?` · ${issues.length} 筆日期問題`:''}`;
  $('#timeline-year').value=state.book.timelineYear||'';
  $('#timeline-zoom-value').textContent=`${Math.round(timelineZoom*100)}%`;
  const select=$('#topic-filter');
  select.innerHTML='<option value="">全部主題</option>'+[...new Set(events.map(event=>event.topic))].map(topic=>`<option value="${esc(topic)}">${esc(topic)}</option>`).join('');
  select.value=filter;
  const chosen=events.filter(event=>!filter||event.topic===filter),root=$('#timeline');root.replaceChildren();
  if(!chosen.length){root.textContent='尚無日期紀錄';return;}
  const min=chosen[0].timestamp,max=chosen.at(-1).timestamp;
  const spanDays=Math.max(1,(max-min)/86400000);
  const trackWidth=Math.max(900,Math.round((spanDays+1)*22*timelineZoom));
  root.style.width=(trackWidth+180)+'px';
  const ruler=document.createElement('div');ruler.className='ruler';
  ruler.innerHTML=`<span>${new Date(min).toLocaleDateString('zh-TW')}</span><span>${new Date(max).toLocaleDateString('zh-TW')}</span>`;
  root.append(ruler);
  const groups=new Map();
  for(const event of chosen){const name=mode==='compact'?event.topic:`${event.topic} / ${event.item}`;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(event);}
  for(const [name,group] of groups){
    const lane=document.createElement('div');lane.className='lane';
    lane.innerHTML=`<div class="lane-name">${esc(name)}</div><div class="lane-track"></div>`;
    const track=lane.lastElementChild;
    const layout=window.TimelineLayout.place(group,{minTime:min,maxTime:max,width:trackWidth});
    track.style.height=layout.height+'px';
    for(const point of layout.points){
      const event=point.event,button=document.createElement('button');button.className='event-chip';
      button.style.left=point.x+'px';button.style.top=(point.row*38+13)+'px';
      button.textContent=event.content.replace(event.rawTimestamp,'').replace(/^[:\s]+/,'').slice(0,26)||event.content.slice(0,26);
      button.title=`${new Date(event.timestamp).toLocaleString('zh-TW')} · ${event.content}`;
      button.onclick=()=>showEvent(event,button);button.ondblclick=()=>openSource(event);
      track.append(button);
    }
    root.append(lane);
  }
}
function showEvent(event,chip) {document.querySelectorAll('.event-chip').forEach(el=>el.classList.remove('selected'));chip.classList.add('selected');const detail=$('#event-detail');detail.classList.remove('hidden');detail.replaceChildren();const text=document.createElement('div');text.textContent=`${new Date(event.timestamp).toLocaleString('zh-TW')} · ${event.topic} / ${event.item} · ${event.content}`;const button=document.createElement('button');button.textContent='開啟來源便利貼';button.onclick=()=>openSource(event);detail.append(text,button);}
function openSource(event) {selectedID=event.noteID;setView('canvas');const card=document.querySelector(`.card[data-id="${event.noteID}"]`);card?.scrollIntoView({block:'center',inline:'center'});const editor=card?.editorAdapter;if(editor){const lines=editor.value.split('\n'),start=lines.slice(0,event.line-1).join('\n').length+(event.line>1?1:0);editor.focus();editor.setSelectionRange(start,start+(lines[event.line-1]?.length||0));}}
function renderMaster() {
  const root=$('#master-list');disposeEditors(root);root.replaceChildren();
  const sheet=document.createElement('article');sheet.className='master-sheet';root.append(sheet);
  for(const group of window.MasterGroups.group(activeNotes(),state.book.topics)){
    const topic=document.createElement('section');topic.className='master-topic';
    const heading=document.createElement('h3');heading.textContent=group.topic;topic.append(heading);
    for(const item of group.items){
      const section=document.createElement('section');section.className='master-item';
      const label=document.createElement('h4');label.textContent=item.item;section.append(label);
      for(const n of item.notes){
        const entry=document.createElement('div');entry.className='master-entry';
        entry.style.height=Math.max(80,n.content.split('\n').length*22+24)+'px';
        const area=document.createElement('textarea');area.spellcheck=false;area.setAttribute('aria-label',`${group.topic}／${item.item}：${title(n)}`);
        area.value=drafts.get(n.id)?.content??n.content;entry.append(area);bindEditor(area,n.id);section.append(entry);
      }
      topic.append(section);
    }
    sheet.append(topic);
  }
}
function renderFloating() {const n=note(floatingID);if(!n){window.myNotes.closeFloating();return;}$('#app').classList.add('hidden');$('#floating').classList.remove('hidden');const floating=$('#floating');floating.style.setProperty('--note-bg',color(n));floating.classList.toggle('collapsed',!!state.book.positions[floatingID]?.collapsed);fillHeaderTitle($('#floating-title'),n);$('#floating-toggle').textContent='−';const editor=$('#floating-editor').editorAdapter;if(editor&&activeEditor!==editor)editor.setValue(drafts.get(n.id)?.content??n.content);}
function renderTodos() {
  const todos=allRecords().filter(record=>record.checkbox!==null),list=$('#todo-list');
  $('#todo-count').textContent=`${todos.filter(record=>!record.checkbox).length} 項未完成 · ${todos.length} 項總計`;
  list.replaceChildren();
  for(const record of todos){const row=document.createElement('div');row.className='todo-row';
    const toggle=document.createElement('button');toggle.className='todo-toggle';toggle.textContent=record.checkbox?'☑':'☐';toggle.title='切換完成狀態';toggle.onclick=async()=>{const source=note(record.noteID);if(!source)return;const lines=source.content.split('\n');lines[record.line-1]=lines[record.line-1].replace(/\[([ xX])\]/,record.checkbox?'[ ]':'[x]');await mutate('content',{id:source.id,content:lines.join('\n'),revision:source.contentRevision||0}).catch(()=>{});};
    const text=document.createElement('button');text.className='todo-text';text.textContent=record.content;text.onclick=()=>openSource(record);
    const source=document.createElement('span');source.textContent=`${record.topic} / ${record.item}`;
    row.append(toggle,text,source);list.append(row);
  }
}
function search(query) {const q=query.trim().toLocaleLowerCase(),results=activeNotes().filter(n=>n.content.toLocaleLowerCase().includes(q));searchIndex=-1;$('#search-input').removeAttribute('aria-activedescendant');$('#search-results').innerHTML=q&&results.length?results.map((n,i)=>`<button id="search-result-${i}" data-id="${esc(n.id)}">${esc(title(n))} <small>${esc(topicFor(n)?.name||'收件匣')}</small></button>`).join(''):'<div style="padding:10px;color:#999;font-size:12px">沒有結果</div>';}
function selectSearchResult(delta) {const buttons=[...$('#search-results').querySelectorAll('button[data-id]')];if(!buttons.length)return;searchIndex=searchIndex<0?(delta>0?0:buttons.length-1):(searchIndex+delta+buttons.length)%buttons.length;buttons.forEach((button,i)=>button.classList.toggle('active',i===searchIndex));const active=buttons[searchIndex];$('#search-input').setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}
function openSearchResult(id) {if(!id)return;selectedID=id;$('#search-dialog').close();setView('canvas');document.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({block:'center',inline:'center'});}
function command(input) {
  const name=typeof input==='string'?input:input?.name;
  if(floatingID&&['new','new-topic','canvas','timeline','master','split','todos','search','restore'].includes(name)){window.myNotes.mainCommand(name);return;}
  const editor=activeEditor;
  if(['bold','italic','underline','strike','checkbox'].includes(name)){if(editor)formatEditor(editor,name);return;}
  if(name==='new')createAt(70+Math.random()*140,70+Math.random()*100);
  if(name==='new-topic'){ $('#topic-dialog').showModal();$('#topic-name').focus(); }
  if(name==='canvas'||name==='timeline'||name==='master'||name==='todos')setView(name);
  if(name==='split')setView(view==='split'?'timeline':'split');
  if(name==='search'){ $('#search-dialog').showModal();$('#search-input').focus(); }
  if(name==='color')showColorDialog();
  if(name==='repeat-color')repeatColor();
  if(name==='collapse'){
    const id=floatingID||(view==='canvas'&&(selectedID||hoveredID||(activeNotes().length===1?activeNotes()[0].id:null)));
    if(id)toggleCollapse(id);else if(view==='canvas')toast('先選取一張便利貼');
  }
  if(name==='float'&&selectedID)window.myNotes.openFloating(selectedID);
  if(name==='delete')deleteSelected(floatingID||selectedID);
  if(name==='restore')mutate('restore').catch(()=>{});
  if(name==='zoom-in'||name==='zoom-out'){const rect=$('#canvas-view').getBoundingClientRect();setCanvasZoom(zoom*(name==='zoom-in'?1.25:.8),rect.left+rect.width/2,rect.top+rect.height/2);}
  if(name==='timeline-zoom-in'||name==='timeline-zoom-out'){timelineZoom=Math.min(4,Math.max(.5,timelineZoom*(name==='timeline-zoom-in'?1.5:1/1.5)));renderTimeline();}
}
document.querySelectorAll('.nav').forEach(button=>button.onclick=()=>setView(button.dataset.view));$('#new-button').onclick=()=>command('new');$('#search-button').onclick=()=>command('search');$('#zoom-in').onclick=()=>command('zoom-in');$('#zoom-out').onclick=()=>command('zoom-out');$('#timeline-zoom-in').onclick=()=>command('timeline-zoom-in');$('#timeline-zoom-out').onclick=()=>command('timeline-zoom-out');$('#topic-filter').onchange=e=>{filter=e.target.value;renderTimeline();};$('#timeline-year').onchange=e=>mutate('year',{year:e.target.value}).catch(()=>{});document.querySelectorAll('.segments button').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;document.querySelectorAll('.segments button').forEach(el=>el.classList.toggle('active',el===button));renderTimeline();});$('#search-input').oninput=e=>search(e.target.value);$('#search-results').onclick=e=>{const id=e.target.closest('button')?.dataset.id;if(id){selectedID=id;$('#search-dialog').close();setView('canvas');document.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({block:'center',inline:'center'});}};$('#search-close').onclick=()=>$('#search-dialog').close();document.querySelectorAll('.dialog-close').forEach(button=>button.onclick=()=>button.closest('dialog').close());$('#topic-create').onclick=async()=>{const name=$('#topic-name').value.trim();if(name){await mutate('topic-create',{name}).catch(()=>{});$('#topic-dialog').close();$('#topic-name').value='';}};$('#color-swatches').onclick=e=>{const choice=e.target.closest('button[data-color]');if(choice&&colorTargetID){mutate('color',{id:colorTargetID,color:choice.dataset.color}).catch(()=>{});$('#color-dialog').close();}};$('#custom-color').onchange=e=>{if(colorTargetID){mutate('color',{id:colorTargetID,color:e.target.value}).catch(()=>{});$('#color-dialog').close();}};
$('#canvas-view').addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();setCanvasZoom(zoom*Math.exp(-event.deltaY*.01),event.clientX,event.clientY);},{passive:false});
let gestureZoom=1;
$('#canvas-view').addEventListener('gesturestart',event=>{event.preventDefault();gestureZoom=zoom;});
$('#canvas-view').addEventListener('gesturechange',event=>{event.preventDefault();setCanvasZoom(gestureZoom*event.scale,event.clientX,event.clientY);});
$('#search-input').addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selectSearchResult(event.key==='ArrowDown'?1:-1);}
  else if(event.key==='Enter'){const button=$('#search-results').querySelectorAll('button[data-id]')[searchIndex];if(button){event.preventDefault();openSearchResult(button.dataset.id);}}
});
$('#floating-close').onclick=async()=>{await saveDraft(floatingID);window.myNotes.closeFloating();};$('#floating-toggle').onclick=()=>toggleCollapse(floatingID);
const floatingHeader=$('#floating-header');
floatingHeader.onpointerdown=e=>{
  if(e.button!==0||e.target.closest('button'))return;
  const last=floatingHeader.lastTap;
  if(e.detail>=2||(last&&Date.now()-last.time<420&&Math.hypot(e.screenX-last.x,e.screenY-last.y)<8)){
    floatingHeader.lastTap=null;e.preventDefault();toggleCollapse(floatingID);return;
  }
  floatingHeader.lastTap={time:Date.now(),x:e.screenX,y:e.screenY};
  let lastX=e.screenX,lastY=e.screenY;
  floatingHeader.setPointerCapture(e.pointerId);
  floatingHeader.onpointermove=event=>{const dx=event.screenX-lastX,dy=event.screenY-lastY;if(Math.hypot(dx,dy)<1)return;floatingHeader.lastTap=null;lastX=event.screenX;lastY=event.screenY;window.myNotes.moveFloating(dx,dy);};
  const end=()=>{floatingHeader.onpointermove=null;floatingHeader.onpointerup=null;floatingHeader.onpointercancel=null;};
  floatingHeader.onpointerup=end;floatingHeader.onpointercancel=end;
};
bindEditor($('#floating-editor'),floatingID);
document.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(e.altKey&&!e.metaKey&&!e.ctrlKey&&key==='c'){e.preventDefault();command(e.shiftKey?'repeat-color':'color');return;}
  if(e.ctrlKey&&!e.metaKey&&(key==='+'||key==='='||key==='-')){e.preventDefault();command(key==='-'?'timeline-zoom-out':'timeline-zoom-in');return;}
  if(e.metaKey||e.ctrlKey){
    const bindings={n:'new',p:'canvas',o:'timeline',r:'collapse','2':'timeline',k:'master',t:'todos',f:'search',b:'bold',i:'italic',u:'underline',s:'strike','\\':'split','+':'zoom-in','=':'zoom-in','-':'zoom-out'};
    const action=e.shiftKey?{n:'new-topic',t:'checkbox'}[key]:bindings[key];
    if(action){e.preventDefault();command(action);}
  }
});
window.myNotes.onCommand(command);window.myNotes.onUpdate(next=>{state=next;if(!activeEditor||!drafts.size)refresh();else if(floatingID)renderFloating();});
window.myNotes.onFloatingFocus(focused=>{if(floatingID)$('#floating').classList.toggle('is-focused',focused);});
window.myNotes.onNoteAction(({id,action})=>{if(!note(id))return;select(id);if(action==='collapse')toggleCollapse(id);if(action==='float')window.myNotes.openFloating(id);if(action==='color')showColorDialog(id);if(action==='delete')deleteSelected(id);});
(async()=>{state=await window.myNotes.snapshot();refresh();})();
