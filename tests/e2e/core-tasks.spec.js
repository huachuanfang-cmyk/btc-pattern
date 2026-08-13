const { test, expect } = require('@playwright/test');

async function measure(task){
  const started=Date.now();
  await task();
  return Date.now()-started;
}

function percentile95(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*.95)-1];
}

async function sampleTask(count,prepareTask,task,reset){
  const samples=[];
  let passed=0;
  for(let i=0;i<count;i++){
    await prepareTask(i);
    try{
      samples.push(await measure(()=>task(i)));
      passed++;
    } finally {
      if(reset) await reset(i);
    }
  }
  return {samples,p95:percentile95(samples),successRate:passed/count*100};
}

async function prepare(locator){
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
}

async function stubMarket(page){
  await page.route('https://www.googletagmanager.com/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('https://api.alternative.me/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"data":[{"value":"50","value_classification":"Neutral"}]}'}));
  await page.route('**/api/market?resource=*',route=>{
    const resource=new URL(route.request().url()).searchParams.get('resource');
    const body=resource==='prices'?{bitcoin:{usd:64000,usd_24h_change:1},ethereum:{usd:1900,usd_24h_change:1},solana:{usd:76,usd_24h_change:1},dogecoin:{usd:.07,usd_24h_change:1},binancecoin:{usd:610,usd_24h_change:1}}:resource==='dominance'?{data:{market_cap_percentage:{btc:58}}}:resource==='funding'?{data:[{fundingRate:'0.00001'}]}:{data:[['0','1.1']]};
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
}

test.beforeEach(async({page})=>stubMarket(page));

test('four core tasks complete within the interaction budget',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-1440','One deterministic task journey is sufficient for interaction timing');
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8',{waitUntil:'domcontentloaded'});

  const metrics={};
  const historyButton=page.getByRole('button',{name:'查询历史规律 →'});
  metrics.history=await sampleTask(20,()=>prepare(historyButton),async()=>{
      await historyButton.click();
      await expect(page.locator('#results')).toHaveClass(/show/);
      await expect(page.locator('#sn')).not.toHaveText('-');
    });

  const comparisonButton=page.locator('#hist-comp-btn');
  const comparisonDates=['2024-03-14','2024-03-13'];
  metrics.comparison=await sampleTask(20,async i=>{
      await page.locator('#hist-date').fill(comparisonDates[i%2]);
      await prepare(comparisonButton);
    },async()=>{
      await comparisonButton.click();
      await expect(page.locator('#tbody')).toContainText('BTC');
      await expect(page.locator('#tbody')).toContainText('ETH');
      await expect(page.locator('#tbody tr')).toHaveCount(5);
    });

  const backtestSummary=page.locator('#backtest-tool summary');
  await prepare(backtestSummary);
  await backtestSummary.click();
  const backtestButton=page.locator('#backtest-tool .cb-run');
  metrics.backtest=await sampleTask(20,()=>prepare(backtestButton),async()=>{
      await backtestButton.click();
      await expect(page.locator('#cb-count')).not.toHaveText('-');
      await expect(page.locator('#cb-roi')).toContainText('%');
    });

  const reportButton=page.getByRole('button',{name:'生成报告卡片'});
  metrics.report=await sampleTask(20,()=>prepare(reportButton),async()=>{
      await reportButton.click();
      await expect(page.locator('#overlay')).toHaveClass(/show/);
      await expect(page.locator('#rcard')).toContainText('历史数据观察报告');
    },()=>page.evaluate(()=>closeModal()));

  for(const [task,metric] of Object.entries(metrics)){
    expect(metric.successRate,`${task} success rate`).toBeGreaterThanOrEqual(95);
    expect(metric.p95,`${task} p95 interaction took ${metric.p95}ms`).toBeLessThan(1000);
  }
  expect(errors).toEqual([]);
  console.table(Object.fromEntries(Object.entries(metrics).map(([task,metric])=>[task,{p95:metric.p95,successRate:metric.successRate}])));
  testInfo.attach('core-task-metrics',{body:Buffer.from(JSON.stringify(metrics,null,2)),contentType:'application/json'});
});
