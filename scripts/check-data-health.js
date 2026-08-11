const fs = require('fs');
const path = require('path');

const EXPECTED_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB'];

function utcDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function utcDayDiff(from, to) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / 86400000) : null;
}

function assessHealth(manifest, options = {}) {
  const nowDay = utcDate(options.now || new Date());
  const maxLagDays = Number.isFinite(Number(options.maxLagDays)) ? Number(options.maxLagDays) : 2;
  const errors = [];
  const warnings = [];
  const assets = [];

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, status: 'invalid', nowDay, maxLagDays, errors: ['Health manifest is not an object.'], warnings, assets };
  }
  if (!nowDay) errors.push('Current UTC date is invalid.');
  if (!utcDate(manifest.generated_at)) errors.push('generated_at is missing or invalid.');
  if (!Array.isArray(manifest.assets)) errors.push('assets must be an array.');

  const sourceAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const byCoin = new Map(sourceAssets.map(asset => [asset?.coin, asset]));
  for (const coin of EXPECTED_COINS) {
    const asset = byCoin.get(coin);
    if (!asset) {
      errors.push(`${coin}: missing from health manifest.`);
      continue;
    }
    const lagDays = utcDayDiff(asset.data_through, nowDay);
    const declaredLag = Number(asset.lag_days);
    const rowCount = Number(asset.rows);
    const assetErrors = [];
    if (!utcDate(asset.data_through)) assetErrors.push('data_through is invalid');
    if (!utcDate(asset.last_checked_at)) assetErrors.push('last_checked_at is invalid');
    if (!Number.isInteger(rowCount) || rowCount < 365) assetErrors.push('row count is unexpectedly small');
    if (!/^[a-f0-9]{64}$/i.test(String(asset.sha256 || ''))) assetErrors.push('SHA-256 is missing or invalid');
    if (!Number.isFinite(lagDays) || lagDays < 0) assetErrors.push('calculated lag is invalid');
    if (Number.isFinite(lagDays) && lagDays > maxLagDays) assetErrors.push(`data is ${lagDays} UTC days behind`);
    if (asset.status !== 'healthy') assetErrors.push(`declared status is ${asset.status || 'missing'}`);
    if (Number.isFinite(declaredLag) && utcDate(manifest.generated_at)) {
      const generatedLag = utcDayDiff(asset.data_through, utcDate(manifest.generated_at));
      if (generatedLag !== declaredLag) warnings.push(`${coin}: declared lag ${declaredLag} differs from generated-time lag ${generatedLag}.`);
    }
    assetErrors.forEach(message => errors.push(`${coin}: ${message}.`));
    assets.push({ coin, dataThrough: asset.data_through, lagDays, rows: rowCount, status: assetErrors.length ? 'degraded' : 'healthy' });
  }

  const unknown = sourceAssets.map(asset => asset?.coin).filter(coin => coin && !EXPECTED_COINS.includes(coin));
  if (unknown.length) warnings.push(`Unexpected assets: ${unknown.join(', ')}.`);
  const dates = [...new Set(assets.map(asset => asset.dataThrough).filter(Boolean))];
  if (dates.length > 1) warnings.push(`Assets do not share one data-through date: ${dates.join(', ')}.`);
  if (manifest.status !== 'healthy') errors.push(`Manifest status is ${manifest.status || 'missing'}.`);

  return {
    ok: errors.length === 0,
    status: errors.length ? 'degraded' : 'healthy',
    checkedAt: new Date(options.now || new Date()).toISOString(),
    nowDay,
    maxLagDays,
    generatedAt: manifest.generated_at || null,
    errors,
    warnings,
    assets,
  };
}

function parseArgs(argv) {
  const options = { file: path.join(__dirname, '..', 'data', 'health.json'), maxLagDays: 2, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') options.url = argv[++index];
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--max-lag') options.maxLagDays = Number(argv[++index]);
    else if (arg === '--now') options.now = argv[++index];
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function loadManifest(options) {
  if (options.url) {
    const separator = options.url.includes('?') ? '&' : '?';
    const response = await fetch(`${options.url}${separator}health_check=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`Published health manifest returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) throw new Error(`Published health manifest returned ${contentType || 'no content type'} instead of JSON.`);
    return response.json();
  }
  return JSON.parse(fs.readFileSync(path.resolve(options.file), 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest(options);
  const result = assessHealth(manifest, options);
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(`Data health: ${result.status}. Checked ${result.assets.length}/${EXPECTED_COINS.length} assets at ${result.checkedAt}.`);
    result.assets.forEach(asset => console.log(`${asset.coin}: ${asset.dataThrough}, lag ${asset.lagDays}d, ${asset.rows} rows, ${asset.status}`));
    result.warnings.forEach(message => console.warn(`Warning: ${message}`));
    result.errors.forEach(message => console.error(`Error: ${message}`));
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Data health check failed: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { EXPECTED_COINS, assessHealth, loadManifest, parseArgs, utcDayDiff };
