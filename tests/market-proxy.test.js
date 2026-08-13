const fs = require('fs');
const assert = require('assert');

async function loadModule() {
  const source = fs.readFileSync('functions/api/market.js', 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function createCache() {
  const entries = new Map();
  return {
    entries,
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, response.clone()); },
  };
}

(async () => {
  const { onRequestGet, RESOURCES } = await loadModule();
  assert.deepStrictEqual(Object.keys(RESOURCES).sort(), ['dominance', 'funding', 'long-short', 'prices']);
  const realFetch = global.fetch;
  const realCaches = global.caches;
  const cache = createCache();
  global.caches = { default: cache };
  let upstreamCalls = 0;
  global.fetch = async url => {
    upstreamCalls += 1;
    assert.strictEqual(String(url), RESOURCES.prices.url);
    return new Response(JSON.stringify({ bitcoin: { usd: 65000 } }), { headers: { 'Content-Type': 'application/json' } });
  };
  const waits = [];
  const context = {
    request: new Request('https://www.mybtcbox.com/api/market?resource=prices'),
    waitUntil(promise) { waits.push(promise); },
  };
  const first = await onRequestGet(context);
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.headers.get('X-MyBTCBox-Cache'), 'MISS');
  assert.strictEqual(first.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=60');
  await Promise.all(waits);
  const second = await onRequestGet(context);
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.headers.get('X-MyBTCBox-Cache'), 'HIT');
  assert.strictEqual(upstreamCalls, 1, 'A cached request must not call the upstream source again');

  const unknown = await onRequestGet({ request: new Request('https://www.mybtcbox.com/api/market?resource=evil') });
  assert.strictEqual(unknown.status, 400, 'Arbitrary upstream URLs must not be accepted');

  const emptyCache = createCache();
  global.caches = { default: emptyCache };
  global.fetch = async url => {
    if (String(url) === RESOURCES.prices.url) return new Response('rate limited', { status: 429, headers: { 'Content-Type': 'text/plain' } });
    return new Response(JSON.stringify([
      { symbol:'BTC', price_usd:'65000', percent_change_24h:'1.2' },
      { symbol:'ETH', price_usd:'2000', percent_change_24h:'-1' },
      { symbol:'SOL', price_usd:'80', percent_change_24h:'2' },
      { symbol:'DOGE', price_usd:'0.08', percent_change_24h:'0.5' },
      { symbol:'BNB', price_usd:'600', percent_change_24h:'-0.2' },
    ]), { headers: { 'Content-Type': 'application/json' } });
  };
  const fallback = await onRequestGet({ request: context.request, waitUntil() {} });
  assert.strictEqual(fallback.status, 200, 'A rate-limited primary source should fail over');
  assert.strictEqual(fallback.headers.get('X-MyBTCBox-Source'), 'api.coinlore.net');
  assert.strictEqual((await fallback.json()).bitcoin.usd, 65000);

  global.fetch = async () => new Response('unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  global.caches = { default: createCache() };
  const failure = await onRequestGet({ request: context.request, waitUntil() {} });
  assert.strictEqual(failure.status, 502, 'Two unavailable sources should become a controlled gateway error');
  const failureBody = await failure.json();
  assert.strictEqual(failureBody.primaryStatus, 503);
  assert.strictEqual(failureBody.fallbackStatus, 503);

  global.fetch = realFetch;
  global.caches = realCaches;
  console.log('Market proxy tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
