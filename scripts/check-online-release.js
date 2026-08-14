const { assessHealth } = require('./check-data-health');

const TOOL_ROUTES = [
  ['/tools/btc-drop-history', 'BTC单日大跌历史查询'],
  ['/tools/btc-rise-history', 'BTC单日大涨历史查询'],
  ['/tools/btc-volatility-history', 'BTC单日振幅历史查询'],
  ['/tools/btc-wick-history', 'BTC插针历史查询'],
  ['/tools/btc-cycle-clock', 'BTC历史周期刻度尺'],
  ['/tools/btc-conditional-buy-backtest', 'BTC条件买入与定投历史回测'],
].map(([path, titleNeedle]) => ({ path, kind:'tool', titleNeedle }));

const HTML_ROUTES = [
  { path:'/', kind:'home' },
  { path:'/tools/', kind:'directory' },
  { path:'/methodology.html', kind:'methodology' },
  { path:'/status.html', kind:'status' },
  { path:'/privacy.html', kind:'privacy' },
  ...TOOL_ROUTES,
];

const JSON_ROUTES = [
  ...['btc','eth','sol','doge','bnb'].map(coin => ({ path:`/data/${coin}.daily.json`, kind:'daily', coin:coin.toUpperCase() })),
  { path:'/data/health.json', kind:'health' },
  { path:'/data/reproducible-example.json', kind:'reproducible' },
];

function absoluteUrl(baseUrl, path) {
  return new URL(path, `${String(baseUrl).replace(/\/$/, '')}/`).toString();
}

function canonicalFrom(html) {
  return html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)?.[1]
    || null;
}

function titleFrom(html) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() || null;
}

function jsonLdItems(html) {
  const items = [];
  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      items.push(...(Array.isArray(value?.['@graph']) ? value['@graph'] : [value]));
    } catch (error) {
      items.push({ __parseError:error.message });
    }
  }
  return items;
}

async function request(url, fetchImpl, timeoutMs) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const separator = url.includes('?') ? '&' : '?';
      return await fetchImpl(`${url}${separator}release_check=${Date.now()}_${attempt}`, {
        headers:{ Accept:'text/html,application/json;q=0.9' },
        redirect:'follow',
        signal:controller.signal,
      });
    } catch (error) {
      lastError = error?.name === 'AbortError' ? new Error(`request timed out after ${timeoutMs}ms`) : error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function inspectHtml(route, options) {
  const url = absoluteUrl(options.baseUrl, route.path);
  const errors = [];
  try {
    const response = await request(url, options.fetchImpl, options.timeoutMs);
    if (response.status !== 200) return { url, ok:false, errors:[`${url}: returned HTTP ${response.status}.`] };
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) errors.push(`${url}: Content-Type is ${contentType || 'missing'}, expected HTML.`);
    const html = await response.text();
    if (route.kind === 'home' && !html.includes('不预测')) errors.push(`${url}: missing the no-prediction product boundary.`);
    if (route.kind === 'methodology' && !jsonLdItems(html).some(item => item?.['@type'] === 'Dataset')) errors.push(`${url}: JSON-LD Dataset is missing.`);
    if (route.kind === 'privacy' && !(html.includes('默认关闭') || html.includes('默认不启用'))) errors.push(`${url}: default-off analytics disclosure is missing.`);
    if (route.kind === 'tool') {
      const canonical = canonicalFrom(html);
      const title = titleFrom(html);
      if (canonical !== url) errors.push(`${url}: canonical is ${canonical || 'missing'}, expected ${url}.`);
      if (!title || !title.includes(route.titleNeedle)) errors.push(`${url}: title is ${title || 'missing'}, expected it to contain ${route.titleNeedle}.`);
      if (!html.includes('计算口径')) errors.push(`${url}: static calculation methodology is missing.`);
      const items = jsonLdItems(html);
      if (items.some(item => item.__parseError)) errors.push(`${url}: JSON-LD cannot be parsed.`);
      const application = items.find(item => item?.['@type'] === 'WebApplication');
      if (!application || application.url !== url) errors.push(`${url}: WebApplication JSON-LD URL is ${application?.url || 'missing'}, expected ${url}.`);
    }
  } catch (error) {
    errors.push(`${url}: request failed: ${error.message || error}.`);
  }
  return { url, ok:errors.length === 0, errors };
}

async function inspectJson(route, options) {
  const url = absoluteUrl(options.baseUrl, route.path);
  const errors = [];
  let health = null;
  try {
    const response = await request(url, options.fetchImpl, options.timeoutMs);
    if (response.status !== 200) return { url, ok:false, errors:[`${url}: returned HTTP ${response.status}.`], health };
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) errors.push(`${url}: Content-Type is ${contentType || 'missing'}, expected application/json.`);
    let value;
    try {
      value = JSON.parse(await response.text());
    } catch (error) {
      errors.push(`${url}: response is not valid JSON: ${error.message}.`);
    }
    if (route.kind === 'health' && value) {
      health = assessHealth(value, { now:options.now, maxLagDays:2 });
      health.errors.forEach(message => errors.push(`${url}: ${message}`));
      if (health.assets.length !== 5) errors.push(`${url}: health manifest covers ${health.assets.length}/5 required assets.`);
    }
  } catch (error) {
    errors.push(`${url}: request failed: ${error.message || error}.`);
  }
  return { url, ok:errors.length === 0, errors, health };
}

async function verifyOnlineRelease(options = {}) {
  const settings = {
    baseUrl:options.baseUrl || 'https://www.mybtcbox.com',
    fetchImpl:options.fetchImpl || global.fetch,
    timeoutMs:Number(options.timeoutMs) || 20000,
    now:options.now || new Date(),
  };
  if (typeof settings.fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  async function inspectInOrder(routes, inspector) {
    const results = [];
    for (const route of routes) results.push(await inspector(route, settings));
    return results;
  }
  const [html, json] = await Promise.all([
    inspectInOrder(HTML_ROUTES, inspectHtml),
    inspectInOrder(JSON_ROUTES, inspectJson),
  ]);
  const errors = [...html, ...json].flatMap(result => result.errors);
  return {
    ok:errors.length === 0,
    baseUrl:settings.baseUrl,
    checkedAt:new Date(settings.now).toISOString(),
    htmlPassed:html.filter(result => result.ok).length,
    htmlTotal:html.length,
    jsonPassed:json.filter(result => result.ok).length,
    jsonTotal:json.length,
    health:json.find(result => result.health)?.health || null,
    errors,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') options.baseUrl = argv[++index];
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await verifyOnlineRelease(options);
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(`Online release: ${result.ok ? 'passed' : 'failed'}. HTML ${result.htmlPassed}/${result.htmlTotal}, JSON ${result.jsonPassed}/${result.jsonTotal}.`);
    if (result.health) console.log(`Data health: ${result.health.assets.filter(asset => asset.status === 'healthy').length}/5 assets healthy; maximum allowed UTC lag 2d.`);
    result.errors.forEach(message => console.error(`Error: ${message}`));
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Online release verification failed: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { HTML_ROUTES, JSON_ROUTES, TOOL_ROUTES, inspectHtml, inspectJson, parseArgs, verifyOnlineRelease };
