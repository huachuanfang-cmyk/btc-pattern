const RESOURCES = {
  prices: {
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,binancecoin&vs_currencies=usd&include_24hr_change=true',
    fallbackUrl: 'https://api.coinlore.net/api/ticker/?id=90,80,48543,2,2710',
    ttl: 60,
  },
  dominance: {
    url: 'https://api.coingecko.com/api/v3/global',
    fallbackUrl: 'https://api.coinlore.net/api/global/',
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

const COINLORE_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin', BNB: 'binancecoin',
};

function normalizeFallback(resourceName, raw) {
  if (resourceName === 'prices') {
    if (!Array.isArray(raw)) throw new Error('Invalid fallback prices');
    const normalized = {};
    for (const item of raw) {
      const id = COINLORE_IDS[item?.symbol];
      const price = Number(item?.price_usd);
      const change = Number(item?.percent_change_24h);
      if (id && Number.isFinite(price)) normalized[id] = { usd: price, usd_24h_change: Number.isFinite(change) ? change : null };
    }
    if (Object.keys(normalized).length !== 5) throw new Error('Incomplete fallback prices');
    return normalized;
  }
  if (resourceName === 'dominance') {
    const row = Array.isArray(raw) ? raw[0] : null;
    const btc = Number(row?.btc_d);
    if (!Number.isFinite(btc)) throw new Error('Invalid fallback dominance');
    return { data: { market_cap_percentage: { btc } } };
  }
  return raw;
}

async function fetchJson(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyBTCBox/1.0 market-data-cache' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error('Upstream unavailable');
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    try { return JSON.parse(text); }
    catch { throw new Error('Invalid upstream JSON'); }
  } finally {
    clearTimeout(timeout);
  }
}

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

  let data;
  let source = new URL(resource.url).hostname;
  let primaryError;
  try {
    data = await fetchJson(resource.url);
  } catch (error) {
    primaryError = error;
  }
  if (data === undefined && resource.fallbackUrl) {
    try {
      data = normalizeFallback(resourceName, await fetchJson(resource.fallbackUrl));
      source = new URL(resource.fallbackUrl).hostname;
    } catch (fallbackError) {
      return json({ error: 'Market sources unavailable', primaryStatus: primaryError?.status || null, fallbackStatus: fallbackError?.status || null }, 502);
    }
  }
  if (data === undefined) {
    const timedOut = primaryError?.name === 'AbortError';
    return json({ error: timedOut ? 'Market source timed out' : 'Market source unavailable', upstreamStatus: primaryError?.status || null }, timedOut ? 504 : 502);
  }

  const body = JSON.stringify(data);

  const fetchedAt = new Date().toISOString();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': `public, max-age=0, s-maxage=${resource.ttl}`,
      'X-Content-Type-Options': 'nosniff',
      'X-MyBTCBox-Cache': 'MISS',
      'X-MyBTCBox-Fetched-At': fetchedAt,
      'X-MyBTCBox-Source': source,
    },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export { RESOURCES };
