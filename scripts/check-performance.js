const { chromium } = require('playwright');
const { spawn } = require('child_process');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const budgets = {
  requests: 24,
  transferredBytes: 1_250_000,
  lcpMs: 2500,
  cls: 0.1,
};

(async () => {
  let server=null;
  if(url.startsWith('http://127.0.0.1:4173')){
    server=spawn(process.execPath,['scripts/serve-static.js'],{stdio:'ignore'});
    for(let attempt=0;attempt<30;attempt++){
      try{ const response=await fetch(url); if(response.ok) break; }catch{}
      await new Promise(resolve => setTimeout(resolve,100));
    }
  }
  const browser = await chromium.launch({ headless:true });
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:2, locale:'zh-CN' });
  const responses=[];
  await page.route('https://www.googletagmanager.com/**', route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('https://api.alternative.me/**', route => route.fulfill({status:200,contentType:'application/json',body:'{"data":[{"value":"50","value_classification":"Neutral"}]}'}));
  page.on('response', response => responses.push(response));
  await page.addInitScript(() => {
    window.__perf={lcp:0,cls:0};
    new PerformanceObserver(list => { for(const entry of list.getEntries()) window.__perf.lcp=Math.max(window.__perf.lcp,entry.startTime); }).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list => { for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.__perf.cls+=entry.value; }).observe({type:'layout-shift',buffered:true});
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#daily-brief-title, .daily-brief-title').first().waitFor({state:'visible'}).catch(()=>{});
  await page.waitForTimeout(1500);
  const entries=await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({name:entry.name,transferSize:entry.transferSize}))); 
  const perf=await page.evaluate(() => window.__perf);
  const initialHtml2Canvas=responses.some(response => response.url().includes('html2canvas'));
  const transferredBytes=entries.reduce((sum,entry) => sum+(entry.transferSize||0),0);
  const metrics={requests:entries.length+1,transferredBytes,lcpMs:Math.round(perf.lcp),cls:Number(perf.cls.toFixed(4)),initialHtml2Canvas};
  console.table(metrics);
  const failures=[];
  if(metrics.requests>budgets.requests) failures.push(`requests ${metrics.requests} > ${budgets.requests}`);
  if(metrics.transferredBytes>budgets.transferredBytes) failures.push(`transfer ${metrics.transferredBytes} > ${budgets.transferredBytes}`);
  if(metrics.lcpMs>budgets.lcpMs) failures.push(`LCP ${metrics.lcpMs}ms > ${budgets.lcpMs}ms`);
  if(metrics.cls>budgets.cls) failures.push(`CLS ${metrics.cls} > ${budgets.cls}`);
  if(initialHtml2Canvas) failures.push('html2canvas loaded before report download');
  await browser.close();
  if(server) server.kill();
  if(failures.length){ console.error(failures.join('\n')); process.exit(1); }
  console.log('Performance budgets passed.');
})().catch(error => { console.error(error); process.exit(1); });
