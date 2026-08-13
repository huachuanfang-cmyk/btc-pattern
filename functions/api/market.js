const RESOURCES = {
  prices: {
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,binancecoin&vs_currencies=usd&include_24hr_change=true',
    ttl: 60,
  },
  dominance: {
    url: 'https://api.coingecko.com/api/v3/global',
    ttl: 300,
  },
  funding: {
    url: 'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
    ttl: 60,
  },
  'long-short': {
    url: 'https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC',
    ttl: 300,
  },
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const resourceName = requestUrl.searchParams.get('resource') || '';
  const resource = RESOURCES[resourceName];
  if (!resource) return json({ error: 'Unknown market resource' }, 400);

  const cache = caches.default;
  const cacheKey = new Request(`https://www.mybtcbox.com/api/market?resource=${encodeURIComponent(resourceName)}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set('X-MyBTCBox-Cache', 'HIT');
    return response;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  let upstream;
  try {
    upstream = await fetch(resource.url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyBTCBox/1.0 market-data-cache' },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return json({ error: timedOut ? 'Market source timed out' : 'Market source unavailable' }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) return json({ error: 'Market source unavailable', upstreamStatus: upstream.status }, 502);
  const contentType = upstream.headers.get('Content-Type') || '';
  if (!contentType.includes('json')) return json({ error: 'Unexpected market source response' }, 502);

  const body = await upstream.text();
  try { JSON.parse(body); }
  catch { return json({ error: 'Invalid market source response' }, 502); }

  const fetchedAt = new Date().toISOString();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': `public, max-age=0, s-maxage=${resource.ttl}`,
      'X-Content-Type-Options': 'nosniff',
      'X-MyBTCBox-Cache': 'MISS',
      'X-MyBTCBox-Fetched-At': fetchedAt,
    },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export { RESOURCES };
