const fs=require('fs');
const assert=require('assert');

const limits={
  'index.html':30_000,
  'assets/app.css':45_000,
  'assets/app.js':150_000,
  'assets/core.js':16_000,
  'assets/backtest-core.js':14_000,
  'assets/report-core.js':10_000,
  'assets/retention.js':6_000,
  'data/daily-summary.js':8_000,
};

for(const [file,limit] of Object.entries(limits)){
  const bytes=fs.statSync(file).size;
  assert(bytes<=limit,`${file} is ${bytes} bytes, above its ${limit}-byte architecture budget`);
}

const core=require('../assets/core.js');
const backtest=require('../assets/backtest-core.js');
const report=require('../assets/report-core.js');
for(const name of ['buildMarketData','btcCycleContext','dailyObservationContext','nextDailyVisit','queryMatchesLatest','utcAddDays','utcDayDiff']){
  assert.strictEqual(typeof core[name],'function',`Core API missing ${name}`);
}
for(const name of ['yearlyBacktest','monthlyTriggers','tieredStats','weeklyRows','backtestDrawdowns']){
  assert.strictEqual(typeof backtest[name],'function',`Backtest API missing ${name}`);
}
for(const name of ['extremes','buckets','streaks','yearly','drawdowns','seasonality']){
  assert.strictEqual(typeof report[name],'function',`Report API missing ${name}`);
}

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
assert(!html.includes('<style'), 'Page structure must not absorb the extracted stylesheet');
assert(!html.includes('html2canvas.min.js'), 'Report renderer must remain lazy-loaded');
assert(!app.includes('mybtcbox-proxy.huachuanfang.workers.dev'), 'Controller must not restore the retired arbitrary proxy');
assert(app.includes("fetch(`/api/market?resource="), 'Controller must use the same-origin market contract');
assert(app.includes('DAILY_SUMMARY'), 'Controller must use the lightweight daily summary for first-view signals');
assert(!html.includes('googletagmanager.com'), 'Homepage must not load analytics before explicit consent');
assert(html.includes('/assets/retention.js'), 'Homepage must use the isolated retention privacy module');

console.table(Object.entries(limits).map(([file,limit])=>({file,bytes:fs.statSync(file).size,limit,usage:`${(fs.statSync(file).size/limit*100).toFixed(1)}%`})));
console.log('Architecture budgets and public API contracts passed.');
