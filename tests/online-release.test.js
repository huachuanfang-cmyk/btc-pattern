const assert = require('assert');
const { HTML_ROUTES, JSON_ROUTES, verifyOnlineRelease } = require('../scripts/check-online-release');

const BASE = 'https://example.test';
const TOOL_PATHS = HTML_ROUTES.filter(route => route.kind === 'tool').map(route => route.path);

function htmlResponse(body, status = 200, contentType = 'text/html; charset=UTF-8') {
  return new Response(body, { status, headers:{ 'content-type':contentType } });
}

function jsonResponse(value, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(value), { status, headers:{ 'content-type':contentType } });
}

function pageHtml(route) {
  const { path, kind } = route;
  const canonical = `${BASE}${path}`;
  const boundary = path === '/' ? '<p>历史数据参考，不预测涨跌</p>' : '';
  const dataset = path === '/methodology.html' ? '<script type="application/ld+json">{"@type":"Dataset"}</script>' : '';
  const privacy = path === '/privacy.html' ? '<p>分析统计默认关闭</p>' : '';
  const tool = kind === 'tool'
    ? `<section class="route-explainer"><h2>计算口径</h2></section><script type="application/ld+json">${JSON.stringify({ '@context':'https://schema.org', '@graph':[{ '@type':'WebApplication', url:canonical }] })}</script>`
    : '';
  return `<!doctype html><html><head><title>${kind === 'tool' ? route.titleNeedle : 'My BTC Box'}</title><link rel="canonical" href="${canonical}"></head><body>${boundary}${dataset}${privacy}${tool}</body></html>`;
}

function healthyManifest() {
  return {
    generated_at:'2026-08-14T03:00:00Z',
    status:'healthy',
    assets:['BTC','ETH','SOL','DOGE','BNB'].map(coin => ({
      coin,
      data_through:'2026-08-13',
      last_checked_at:'2026-08-14T03:00:00Z',
      rows:1000,
      lag_days:1,
      status:'healthy',
      sha256:'a'.repeat(64),
    })),
  };
}

function fixtureFetch(overrides = {}) {
  return async input => {
    const url = new URL(input);
    const path = url.pathname;
    if (overrides[path]) return overrides[path]();
    const htmlRoute = HTML_ROUTES.find(route => route.path === path);
    if (htmlRoute) return htmlResponse(pageHtml(htmlRoute));
    if (path === '/data/health.json') return jsonResponse(healthyManifest());
    if (JSON_ROUTES.some(route => route.path === path)) return jsonResponse({ ok:true });
    return new Response('missing', { status:404 });
  };
}

(async () => {
  const result = await verifyOnlineRelease({ baseUrl:BASE, fetchImpl:fixtureFetch(), now:'2026-08-14T08:00:00Z' });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.htmlPassed, HTML_ROUTES.length);
  assert.strictEqual(result.jsonPassed, JSON_ROUTES.length);
  assert.strictEqual(result.health.assets.length, 5);
  assert.strictEqual(TOOL_PATHS.length, 6);

  const brokenUrl = `${BASE}/tools/btc-wick-history`;
  const broken = await verifyOnlineRelease({
    baseUrl:BASE,
    fetchImpl:fixtureFetch({ '/tools/btc-wick-history':() => htmlResponse('upstream unavailable', 503) }),
    now:'2026-08-14T08:00:00Z',
  });
  assert.strictEqual(broken.ok, false);
  assert(broken.errors.some(message => message.includes(brokenUrl) && message.includes('HTTP 503')));

  const wrongCanonical = await verifyOnlineRelease({
    baseUrl:BASE,
    fetchImpl:fixtureFetch({
      '/tools/btc-drop-history':() => htmlResponse(pageHtml(HTML_ROUTES.find(route => route.path === '/tools/btc-rise-history'))),
    }),
    now:'2026-08-14T08:00:00Z',
  });
  assert.strictEqual(wrongCanonical.ok, false);
  assert(wrongCanonical.errors.some(message => message.includes('/tools/btc-drop-history') && message.includes('canonical')));

  const stale = healthyManifest();
  stale.assets[0].data_through = '2026-08-10';
  const staleResult = await verifyOnlineRelease({
    baseUrl:BASE,
    fetchImpl:fixtureFetch({ '/data/health.json':() => jsonResponse(stale) }),
    now:'2026-08-14T08:00:00Z',
  });
  assert.strictEqual(staleResult.ok, false);
  assert(staleResult.errors.some(message => message.includes('/data/health.json') && message.includes('behind')));

  const wrongJsonType = await verifyOnlineRelease({
    baseUrl:BASE,
    fetchImpl:fixtureFetch({ '/data/btc.daily.json':() => htmlResponse('<html>fallback</html>') }),
    now:'2026-08-14T08:00:00Z',
  });
  assert.strictEqual(wrongJsonType.ok, false);
  assert(wrongJsonType.errors.some(message => message.includes('/data/btc.daily.json') && message.includes('Content-Type')));

  const networkFailure = await verifyOnlineRelease({
    baseUrl:BASE,
    fetchImpl:fixtureFetch({ '/status.html':() => { throw new Error('socket closed'); } }),
    now:'2026-08-14T08:00:00Z',
  });
  assert.strictEqual(networkFailure.ok, false);
  assert(networkFailure.errors.some(message => message.includes(`${BASE}/status.html`) && message.includes('socket closed')));

  console.log('Online release verifier tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
