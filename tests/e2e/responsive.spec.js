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
  await page.route('https://mybtcbox-proxy.huachuanfang.workers.dev/**', route => {
    const target = decodeURIComponent(new URL(route.request().url()).searchParams.get('url') || '');
    let body = {};
    if (target.includes('/simple/price')) body = {
      bitcoin: { usd: 64845, usd_24h_change: -0.09 },
      ethereum: { usd: 3500, usd_24h_change: -0.36 },
      solana: { usd: 76.21, usd_24h_change: 0.32 },
      dogecoin: { usd: 0.11, usd_24h_change: -1.61 },
      binancecoin: { usd: 650, usd_24h_change: 0.22 },
    };
    else if (target.includes('/global')) body = { data: { market_cap_percentage: { btc: 55.2 } } };
    else if (target.includes('funding-rate')) body = { code: '0', data: [{ fundingRate: '0.00001' }] };
    else if (target.includes('long-short-account-ratio')) body = { code: '0', data: [['0', '1.1']] };
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
