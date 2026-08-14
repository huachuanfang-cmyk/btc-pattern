const { test, expect } = require('@playwright/test');

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content, `content width ${dimensions.content} should fit viewport ${dimensions.viewport}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function stubExternalData(page) {
  await page.route('https://www.googletagmanager.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://api.alternative.me/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ value: '50', value_classification: 'Neutral' }] }),
  }));
  await page.route('**/api/market?resource=*', route => {
    const target = new URL(route.request().url()).searchParams.get('resource') || '';
    let body = {};
    if (target === 'prices') body = {
      bitcoin: { usd: 64845, usd_24h_change: -0.09 },
      ethereum: { usd: 3500, usd_24h_change: -0.36 },
      solana: { usd: 76.21, usd_24h_change: 0.32 },
      dogecoin: { usd: 0.11, usd_24h_change: -1.61 },
      binancecoin: { usd: 650, usd_24h_change: 0.22 },
    };
    else if (target === 'dominance') body = { data: { market_cap_percentage: { btc: 55.2 } } };
    else if (target === 'funding') body = { code: '0', data: [{ fundingRate: '0.00001' }] };
    else if (target === 'long-short') body = { code: '0', data: [['0', '1.1']] };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await stubExternalData(page);
});

test('daily observation and historical query remain usable', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#daily-brief')).toContainText('今日观察');
  await expect(page.locator('#daily-scan-count')).toContainText('/5');
  await expect(page.getByRole('button', { name: '分享今日观察' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const queryButton = page.getByRole('button', { name: '查询历史规律 →' });
  expect((await queryButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await queryButton.click();
  await expect(page.locator('#results')).toHaveClass(/show/);
  await expect(page.locator('#sn')).not.toHaveText('-');
  await expect(page.getByRole('button', { name: '生成报告卡片' })).toBeVisible();
  await page.getByRole('button', { name: '保存这个关注条件' }).click();
  await expect(page.locator('.daily-saved-item')).toHaveCount(1);
  await expect(page.locator('.daily-saved-item')).toContainText('BTC 跌 8%');
  expect((await page.locator('.daily-saved-item').boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});

test('returning visitors see completed-candle changes without a forecast', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('btcPatternDailyVisit',JSON.stringify({lastDate:'2026-08-10',streak:1,totalDays:1}));
    localStorage.setItem('btcPatternSavedQueries',JSON.stringify([
      {coin:'DOGE',type:'rise',threshold:3},
      {coin:'DOGE',type:'drop',threshold:3}
    ]));
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const brief=page.locator('.return-brief');
  await expect(brief).toBeVisible();
  await expect(brief).toContainText('上次来访后');
  await expect(brief).toContainText('2 根新日线');
  await expect(brief).toContainText('不预测下一步');
  await expect(brief.locator('button')).toHaveCount(2);
  for(const button of await brief.locator('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.evaluate(()=>renderDailyObservation());
  await expect(page.locator('.return-brief')).toContainText('2 根新日线');
  await expectNoHorizontalOverflow(page);
});

test('first visits do not show an invented return summary', async ({ page }) => {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.return-brief')).toHaveCount(0);
});

test('live market failure falls back to completed daily data', async ({ page }) => {
  await page.route('**/api/market?resource=prices', route => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"unavailable"}' }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#live-price-status')).toContainText('已回退完整日线');
  await expect(page.locator('#tp')).not.toHaveText('-');
  await expect(page.locator('#daily-brief')).toContainText('今日观察');
  await expectNoHorizontalOverflow(page);
});

test('recent successful market data survives a temporary outage', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#live-price-status')).toContainText('本站缓存实时行情');
  const livePrice = await page.locator('#tp').textContent();
  await page.route('**/api/market?resource=prices', route => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"unavailable"}' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#live-price-status')).toContainText('最近成功行情');
  await expect(page.locator('#tp')).toHaveText(livePrice);
});

test('conditional backtest and tiered mode remain usable', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?kind=backtest&asset=btc&start=2024-06-01&drop=8&amount=100', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#backtest-tool')).toHaveAttribute('open', '');
  await expect(page.locator('#cb-start')).toHaveValue('2024-06-01');
  await expect(page.locator('#cb-count')).not.toHaveText('-');
  await expectNoHorizontalOverflow(page);
  expect((await page.locator('#backtest-tool .cb-run').boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect((await page.locator('#cb-start').boundingBox()).height).toBeGreaterThanOrEqual(44);

  await page.locator('#cb-tiered').check();
  await expect(page.locator('#cb-tier-panel')).toHaveClass(/on/);
  await expect(page.locator('#cb-count')).toContainText('d /');
  expect(errors).toEqual([]);
});

test('public data status exposes all five assets', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/status.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#status-summary')).toHaveClass(/healthy/);
  await expect(page.locator('#healthy-count')).toHaveText('5 / 5');
  await expect(page.locator('.asset-row:not(.placeholder)')).toHaveCount(5);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('tool directory exposes all six tasks without overflow', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/tools/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('从一个问题开始查历史');
  await expect(page.locator('.tool-list > a')).toHaveCount(6);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.mybtcbox.com/tools/');
  await expect(page.getByText('共同数据原则')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('historical report stays readable inside the viewport', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '查询历史规律 →' }).click();
  await page.getByRole('button', { name: '生成报告卡片' }).click();
  await expect(page.locator('#overlay')).toHaveClass(/show/);
  await expect(page.locator('#rcard')).toContainText('历史数据观察报告');
  await expect(page.locator('#rcard')).toContainText('重大回撤');
  const modal = await page.locator('.modal').boundingBox();
  const viewport = page.viewportSize();
  expect(modal.width).toBeLessThanOrEqual(viewport.width);
  expect(modal.x).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('keyboard focus, control targets, and report dialog remain accessible', async ({ page }) => {
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8', { waitUntil:'domcontentloaded' });

  const unnamedButtons = await page.locator('button:visible').evaluateAll(buttons => buttons
    .filter(button => !(button.getAttribute('aria-label') || button.textContent.trim()))
    .length);
  expect(unnamedButtons).toBe(0);

  const controls = page.locator('.lbtn:visible,.tb:visible,.qsel:visible,.save-query-btn:visible,.rpt-btn:visible');
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const contrastResults = await controls.evaluateAll(elements => {
    const rgb = value => (value.match(/[\d.]+/g) || []).slice(0,3).map(Number);
    const luminance = value => {
      const channels = rgb(value).map(channel => {
        const unit = channel / 255;
        return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const background = element => {
      let node = element;
      while (node) {
        const value = getComputedStyle(node).backgroundColor;
        if (value && !value.endsWith(', 0)')) return value;
        node = node.parentElement;
      }
      return 'rgb(8, 11, 16)';
    };
    return elements.map(element => {
      const foreground = getComputedStyle(element).color;
      const back = background(element);
      const lighter = Math.max(luminance(foreground), luminance(back));
      const darker = Math.min(luminance(foreground), luminance(back));
      return { label:element.textContent.trim(), ratio:(lighter + .05) / (darker + .05) };
    });
  });
  for (const result of contrastResults) expect(result.ratio, result.label).toBeGreaterThanOrEqual(4.5);

  const primary = page.getByRole('button', { name:'查询历史规律 →' });
  await primary.focus();
  const focusStyle = await primary.evaluate(element => {
    const style = getComputedStyle(element);
    return { width:parseFloat(style.outlineWidth), style:style.outlineStyle };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);

  await primary.click();
  const trigger = page.getByRole('button', { name:'生成报告卡片' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name:'数据观察报告' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#dl-btn')).toBeFocused();

  const close = dialog.getByRole('button', { name:'关闭' });
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#dl-btn')).toBeFocused();
  await page.locator('#dl-btn').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('report renderer loads only when PNG download is requested', async ({ page }) => {
  let rendererRequests=0;
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', route => {
    rendererRequests += 1;
    route.fulfill({ status:200, contentType:'application/javascript', body:'window.html2canvas=async function(){const c=document.createElement("canvas");c.width=2;c.height=2;return c;};' });
  });
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8', { waitUntil:'domcontentloaded' });
  expect(rendererRequests).toBe(0);
  await page.getByRole('button', { name:'查询历史规律 →' }).click();
  await page.getByRole('button', { name:'生成报告卡片' }).click();
  expect(rendererRequests).toBe(0);
  await page.locator('#dl-btn').click();
  await expect.poll(() => rendererRequests).toBe(1);
  await expect(page.locator('#dl-btn')).toContainText('已下载');
});

test('report download produces a readable PNG artifact', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390', 'One real long-PNG render avoids redundant parallel browser memory pressure');
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', route => route.fulfill({
    status:200,
    contentType:'application/javascript',
    path:require.resolve('html2canvas/dist/html2canvas.min.js'),
  }));
  await page.goto('/?kind=event&asset=btc&type=drop&threshold=8', { waitUntil:'domcontentloaded' });
  await page.getByRole('button', { name:'查询历史规律 →' }).click();
  await page.getByRole('button', { name:'生成报告卡片' }).click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#dl-btn').click();
  const download=await downloadPromise;
  const stream=await download.createReadStream();
  const chunks=[];
  for await(const chunk of stream) chunks.push(chunk);
  const png=Buffer.concat(chunks);
  expect(png.subarray(1,4).toString()).toBe('PNG');
  const width=png.readUInt32BE(16);
  const height=png.readUInt32BE(20);
  expect(width).toBeGreaterThanOrEqual(850);
  expect(height).toBeGreaterThan(width);
  expect(png.length).toBeGreaterThan(100_000);
});

test('daily share falls back with a clear clipboard failure message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
    Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('denied'))},configurable:true});
  });
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await page.getByRole('button',{name:'分享今日观察'}).click();
  await expect(page.locator('#toast')).toContainText('复制失败，请使用浏览器分享菜单');
  await expect(page.locator('#toast')).toHaveClass(/show/);
});

test('methodology example remains readable and exposes reproducible data', async ({ page }) => {
  await page.goto('/methodology.html', { waitUntil:'domcontentloaded' });
  await expect(page.getByRole('heading',{name:'一组可以独立复算的真实样本'})).toBeVisible();
  await expect(page.locator('.example-row')).toHaveCount(6);
  await expect(page.locator('.example')).toContainText('未来 30 日结果');
  await expect(page.locator('.example')).toContainText('-10.61%');
  const box=await page.locator('.example').boundingBox();
  const viewport=page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
  const response=await page.request.get('/data/reproducible-example.json');
  expect(response.ok()).toBeTruthy();
  const example=await response.json();
  expect(example.outputs.intraday_range_pct).toBe(7.57);
});

test('analytics stays off by default and requires explicit consent', async ({ page }) => {
  let analyticsRequests=0;
  await page.route('https://www.googletagmanager.com/**',route=>{
    analyticsRequests++;
    route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  expect(analyticsRequests).toBe(0);
  await page.goto('/privacy.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#privacy-status')).toContainText('默认');
  const box=await page.locator('.panel').boundingBox();
  expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.locator('#allow').click();
  await expect(page.locator('#privacy-status')).toContainText('已开启');
  await expect.poll(()=>analyticsRequests).toBe(1);
  await page.locator('#deny').click();
  await expect(page.locator('#privacy-status')).toContainText('已关闭');
});
