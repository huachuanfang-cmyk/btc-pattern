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
  global.fetch = async () => new Response('rate limited', { status: 429, headers: { 'Content-Type': 'text/plain' } });
  const failure = await onRequestGet({ request: context.request, waitUntil() {} });
  assert.strictEqual(failure.status, 502, 'Upstream rate limits should become a controlled gateway error');
  assert.strictEqual((await failure.json()).upstreamStatus, 429);

  global.fetch = realFetch;
  global.caches = realCaches;
  console.log('Market proxy tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
