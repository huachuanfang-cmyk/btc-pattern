const assert=require('assert');
const {build,matches,render}=require('../assets/return-brief.js');

const coins={
  BTC:[{date:'2026-08-10',pct:-2,range_pct:4,low_to_close:2},{date:'2026-08-11',pct:-8.2,range_pct:10,low_to_close:4},{date:'2026-08-12',pct:3,range_pct:5,low_to_close:1}],
  SOL:[{date:'2026-08-10',pct:4,range_pct:7,low_to_close:3},{date:'2026-08-11',pct:-11,range_pct:14,low_to_close:6},{date:'2026-08-12',pct:5,range_pct:8,low_to_close:2}],
};
const queries=[{coin:'BTC',type:'drop',threshold:8},{coin:'SOL',type:'wick',threshold:5},{coin:'SOL',type:'rise',threshold:10}];
const brief=build('2026-08-09','2026-08-12',coins,queries);
assert.strictEqual(brief.newDays,3);
assert.deepStrictEqual({coin:brief.biggest.coin,date:brief.biggest.date,pct:brief.biggest.pct},{coin:'SOL',date:'2026-08-11',pct:-11});
assert.deepStrictEqual(brief.conditions,[{index:0,count:1,latestDate:'2026-08-11'},{index:1,count:1,latestDate:'2026-08-11'}]);
assert.strictEqual(build(null,'2026-08-12',coins,queries),null,'First visit must not invent a return summary');
assert.strictEqual(build('2026-08-12','2026-08-12',coins,queries),null,'Same completed day must not repeat a summary');
assert.strictEqual(matches({range_pct:8},{type:'range',threshold:8}),true);
assert.strictEqual(matches({pct:8},{type:'unknown',threshold:8}),false);
const html=render(brief,{lang:'zh',queries,labels:['BTC 跌 8%','SOL 插针 5%','SOL 涨 10%']});
assert(html.includes('3 根新日线'));
assert(html.includes('共触发 2 次'));
assert(html.includes('不预测下一步'));
console.log('Return brief tests passed.');
