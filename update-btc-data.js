const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SYMBOL = 'BTC-USD';
const COIN = 'BTC';
const START_DATE = '2017-01-01';
const OUT_DIR = path.join(__dirname, 'data');
const JSON_PATH = path.join(OUT_DIR, 'btc.daily.json');
const JS_PATH = path.join(OUT_DIR, 'btc.daily.js');

function unixSeconds(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

function utcDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function round(n, d = 2) {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
}

function pct(a, b) {
  return !a || !b ? null : round((a / b - 1) * 100, 2);
}

async function fetchYahooDaily() {
  const period1 = unixSeconds(START_DATE);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const data = await fetchJson(url);
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error('Yahoo Finance response did not include daily candles.');
  }

  const quote = result.indicators?.quote?.[0];
  if (!quote) {
    throw new Error('Yahoo Finance response did not include OHLCV quote data.');
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
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(quote.volume?.[i] || 0),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows.filter((row) => row.date >= START_DATE);
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

function validate(rows) {
  const problems = [];
  const seen = new Set();

  for (const row of rows) {
    if (seen.has(row.date)) problems.push(`duplicate date ${row.date}`);
    seen.add(row.date);
    if (row.low > row.high) problems.push(`${row.date}: low > high`);
    if (row.open < row.low || row.open > row.high) problems.push(`${row.date}: open outside low/high`);
    if (row.close < row.low || row.close > row.high) problems.push(`${row.date}: close outside low/high`);
  }

  if (problems.length) {
    throw new Error(`Data validation failed:\n${problems.slice(0, 20).join('\n')}`);
  }
}

async function main() {
  const rawRows = await fetchYahooDaily();
  const daily = addDerivedFields(rawRows);
  validate(daily);

  const output = {
    coin: COIN,
    symbol: SYMBOL,
    generated: new Date().toISOString().slice(0, 10),
    date_range: `${daily[0].date} to ${daily[daily.length - 1].date}`,
    data_through: daily[daily.length - 1].date,
    source: {
      ohlcv: `Yahoo Finance ${SYMBOL}`,
      endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart',
      timezone: 'UTC daily candles',
      note:
        'open/high/low/close/volume use one unified Yahoo Finance OHLCV source. Volume is Yahoo source volume, not global exchange volume.',
    },
    current_price: null,
    daily,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(output));
  fs.writeFileSync(JS_PATH, `window.BTC_DAILY_DATA=${JSON.stringify(output)};\n`);

  console.log(`Updated ${COIN} data`);
  console.log(`Rows: ${daily.length}`);
  console.log(`Range: ${output.date_range}`);
  console.log(`JSON: ${JSON_PATH}`);
  console.log(`JS:   ${JS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
