const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const START_DATE = '2017-01-01';
const OUT_DIR = path.join(__dirname, 'data');

const COINS = [
  { coin: 'BTC', name: 'Bitcoin', symbol: 'BTC-USD' },
  { coin: 'ETH', name: 'Ethereum', symbol: 'ETH-USD' },
  { coin: 'SOL', name: 'Solana', symbol: 'SOL-USD' },
  { coin: 'DOGE', name: 'Dogecoin', symbol: 'DOGE-USD' },
  { coin: 'BNB', name: 'BNB', symbol: 'BNB-USD' },
];

function unixSeconds(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

function utcDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function utcDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function utcDayDiff(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function keepCompletedUtcDays(rows, now = new Date()) {
  const currentUtcDay = utcDay(now);
  return rows.filter((row) => row.date < currentUtcDay);
}

function round(n, d = 2) {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
}

function roundPrice(n) {
  return n == null || !Number.isFinite(n) ? null : Number(n.toFixed(8));
}

function pct(a, b) {
  return !a || !b ? null : round((a / b - 1) * 100, 2);
}

async function fetchYahooDaily(symbol, now = new Date()) {
  const period1 = unixSeconds(START_DATE);
  const period2 = Math.floor(new Date(now).getTime() / 1000) + 86400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const data = await fetchJson(url);
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(`${symbol}: Yahoo Finance response did not include daily candles.`);
  }

  const quote = result.indicators?.quote?.[0];
  if (!quote) {
    throw new Error(`${symbol}: Yahoo Finance response did not include OHLCV quote data.`);
  }

  const rows = [];
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (![open, high, low, close].every(Number.isFinite)) continue;

    rows.push({
      date: utcDate(result.timestamp[i]),
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume: Math.round(quote.volume?.[i] || 0),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return keepCompletedUtcDays(
    rows.filter((row) => row.date >= START_DATE),
    now,
  );
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
      },
    });

    if (res.ok) return res.json();
    if (res.status !== 403) {
      throw new Error(`Yahoo Finance request failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    if (!String(err?.message || err).includes('403')) {
      console.warn(`Node fetch failed, trying PowerShell fallback: ${err.message || err}`);
    }
  }

  return fetchJsonWithPowerShell(url);
}

function fetchJsonWithPowerShell(url) {
  const escaped = url.replace(/'/g, "''");
  const script = [
    "$ProgressPreference='SilentlyContinue'",
    "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12",
    `$url='${escaped}'`,
    "$headers=@{'User-Agent'='Mozilla/5.0';'Accept'='application/json,text/plain,*/*'}",
    '$r=Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing',
    '$r.Content',
  ].join('; ');

  const candidates = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'powershell.exe',
  ];

  let lastError;
  for (const shell of candidates) {
    try {
      const text = execFileSync(shell, ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(text);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`PowerShell fallback failed: ${lastError?.message || lastError}`);
}

function addDerivedFields(rows) {
  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    const prevClose = prev?.close || null;
    const closePct = prevClose ? pct(row.close, prevClose) : null;

    return {
      ...row,
      pct: closePct,
      next1: rows[i + 1] ? pct(rows[i + 1].close, row.close) : null,
      next7: rows[i + 7] ? pct(rows[i + 7].close, row.close) : null,
      next30: rows[i + 30] ? pct(rows[i + 30].close, row.close) : null,
      low_to_close: pct(row.close, row.low),
      drop_to_low: prevClose ? pct(row.low, prevClose) : null,
    };
  });
}

function validate(rows, symbol) {
  const problems = [];
  const seen = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (seen.has(row.date)) problems.push(`duplicate date ${row.date}`);
    seen.add(row.date);
    if (![row.open, row.high, row.low, row.close].every(Number.isFinite)) problems.push(`${row.date}: non-finite OHLC value`);
    if (!Number.isFinite(row.volume) || row.volume < 0) problems.push(`${row.date}: invalid volume`);
    if (row.low > row.high) problems.push(`${row.date}: low > high`);
    if (row.open < row.low || row.open > row.high) problems.push(`${row.date}: open outside low/high`);
    if (row.close < row.low || row.close > row.high) problems.push(`${row.date}: close outside low/high`);
    if (index > 0) {
      const previous = rows[index - 1];
      const gap = utcDayDiff(previous.date, row.date);
      if (gap !== 1) problems.push(`${previous.date} to ${row.date}: expected 1 UTC day, found ${gap}`);
    }
  }

  if (problems.length) {
    throw new Error(`${symbol} data validation failed:\n${problems.slice(0, 20).join('\n')}`);
  }
}

function buildHealthManifest(datasets, generatedAt = new Date().toISOString()) {
  const generatedDay = utcDay(generatedAt);
  const assets = datasets.map((dataset) => {
    const lagDays = dataset.data_through ? utcDayDiff(dataset.data_through, generatedDay) : null;
    return {
      coin: dataset.coin,
      name: dataset.name,
      symbol: dataset.symbol,
      start: dataset.daily[0]?.date || null,
      data_through: dataset.data_through,
      last_checked_at: dataset.last_checked_at,
      rows: dataset.daily.length,
      lag_days: lagDays,
      status: Number.isFinite(lagDays) && lagDays <= 2 ? 'healthy' : 'stale',
      sha256: crypto.createHash('sha256').update(JSON.stringify(dataset.daily)).digest('hex'),
      source: dataset.source?.ohlcv || null,
    };
  });
  return {
    generated_at: generatedAt,
    status: assets.every((asset) => asset.status === 'healthy') ? 'healthy' : 'degraded',
    assets,
  };
}

function buildDailySummary(datasets, generatedAt = new Date().toISOString()) {
  const count = (rows, predicate) => rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
  const coins = {};
  for (const dataset of datasets) {
    const rows = dataset.daily;
    const latest = rows[rows.length - 1];
    const thresholds = [3, 5, 8];
    const stats = type => Object.fromEntries(thresholds.map(threshold => [String(threshold), {
      count: count(rows, row => type === 'drop' ? row.pct <= -threshold : type === 'rise' ? row.pct >= threshold : pct(row.high, row.low) >= threshold),
    }]));
    coins[dataset.coin] = {
      data_through: dataset.data_through,
      daily: [{ date:latest.date, close:latest.close, high:latest.high, low:latest.low, pct:latest.pct, range_pct:pct(latest.high,latest.low), low_to_close:latest.low_to_close }],
      pre: { drop:stats('drop'), rise:stats('rise'), range:stats('range') },
      wick: { pre:Object.fromEntries([5,8].map(threshold => [String(threshold), { count:count(rows,row => row.low_to_close >= threshold) }])) },
    };
  }
  return { generated_at:generatedAt, coins };
}

function buildReturnWindow(datasets, generatedAt = new Date().toISOString(), windowDays = 30) {
  const coins = {};
  for (const dataset of datasets) {
    coins[dataset.coin] = dataset.daily.slice(-windowDays).map(row => ({
      date: row.date,
      pct: row.pct,
      range_pct: pct(row.high, row.low),
      low_to_close: row.low_to_close,
    }));
  }
  return { generated_at:generatedAt, window_days:windowDays, coins };
}

async function buildCoinDataset(config) {
  const rawRows = await fetchYahooDaily(config.symbol);
  if (!rawRows.length) throw new Error(`${config.symbol}: no rows returned from Yahoo Finance.`);

  const daily = addDerivedFields(rawRows);
  validate(daily, config.symbol);
  const checkedAt = new Date().toISOString();

  return {
    coin: config.coin,
    name: config.name,
    symbol: config.symbol,
    generated: checkedAt.slice(0, 10),
    last_checked_at: checkedAt,
    date_range: `${daily[0].date} to ${daily[daily.length - 1].date}`,
    data_through: daily[daily.length - 1].date,
    source: {
      ohlcv: `Yahoo Finance ${config.symbol}`,
      endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart',
      timezone: 'UTC daily candles',
      note:
        'open/high/low/close/volume use one unified Yahoo Finance OHLCV source. Volume is Yahoo source volume, not global exchange volume.',
    },
    current_price: null,
    daily,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const datasets = [];

  for (const config of COINS) {
    console.log(`Fetching ${config.coin} (${config.symbol})...`);
    const dataset = await buildCoinDataset(config);
    datasets.push(dataset);

    const base = config.coin.toLowerCase();
    const jsonPath = path.join(OUT_DIR, `${base}.daily.json`);
    const jsPath = path.join(OUT_DIR, `${base}.daily.js`);
    fs.writeFileSync(jsonPath, JSON.stringify(dataset));

    const varName = `${config.coin}_DAILY_DATA`;
    fs.writeFileSync(jsPath, `window.${varName}=${JSON.stringify(dataset)};\n`);

    if (config.coin === 'BTC') {
      fs.writeFileSync(path.join(OUT_DIR, 'btc.daily.json'), JSON.stringify(dataset));
      fs.writeFileSync(path.join(OUT_DIR, 'btc.daily.js'), `window.BTC_DAILY_DATA=${JSON.stringify(dataset)};\n`);
    }

    console.log(`  Rows: ${dataset.daily.length}`);
    console.log(`  Range: ${dataset.date_range}`);
  }

  const health = buildHealthManifest(datasets);
  fs.writeFileSync(path.join(OUT_DIR, 'health.json'), JSON.stringify(health));
  fs.writeFileSync(path.join(OUT_DIR, 'health.js'), `window.CRYPTO_DATA_HEALTH=${JSON.stringify(health)};\n`);
  const summary = buildDailySummary(datasets, health.generated_at);
  fs.writeFileSync(path.join(OUT_DIR, 'daily-summary.json'), JSON.stringify(summary));
  fs.writeFileSync(path.join(OUT_DIR, 'daily-summary.js'), `window.CRYPTO_DAILY_SUMMARY=${JSON.stringify(summary)};\n`);
  const returnWindow = buildReturnWindow(datasets, health.generated_at);
  fs.writeFileSync(path.join(OUT_DIR, 'return-window.json'), JSON.stringify(returnWindow));
  fs.writeFileSync(path.join(OUT_DIR, 'return-window.js'), `window.CRYPTO_RETURN_WINDOW=${JSON.stringify(returnWindow)};\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  START_DATE,
  addDerivedFields,
  buildHealthManifest,
  buildDailySummary,
  buildReturnWindow,
  keepCompletedUtcDays,
  utcDay,
  utcDayDiff,
  validate,
};
