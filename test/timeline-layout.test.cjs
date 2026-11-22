const test=require('node:test');
const assert=require('node:assert/strict');
const { place }=require('../timeline-layout.js');

test('同日及相近日期事件的標籤不互相遮蓋',()=>{
  const day=86400000,events=[0,0,0,day,day*2,day*20].map((offset,index)=>({timestamp:Date.UTC(2026,10,1)+offset,id:index}));
  const layout=place(events,{minTime:events[0].timestamp,maxTime:events.at(-1).timestamp,width:900});
  assert.equal(layout.points.length,6);
  for(let i=0;i<layout.points.length;i++)for(let j=i+1;j<layout.points.length;j++){
    const a=layout.points[i],b=layout.points[j];
    if(a.row===b.row) assert.ok(b.x>=a.x+170+12,`${a.event.id} 與 ${b.event.id} 重疊`);
  }
  assert.ok(layout.rows>=3);
});
