const assert = require('assert');
const { assessHealth, parseArgs, utcDayDiff } = require('../scripts/check-data-health.js');

function asset(coin, overrides = {}) {
  return {
    coin,
    data_through: '2026-08-09',
    last_checked_at: '2026-08-11T03:57:33.000Z',
    rows: 1000,
    lag_days: 2,
    status: 'healthy',
    sha256: 'a'.repeat(64),
    ...overrides,
  };
}

const healthyManifest = {
  generated_at: '2026-08-11T03:57:34.000Z',
  status: 'healthy',
  assets: ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB'].map(coin => asset(coin)),
};

assert.strictEqual(utcDayDiff('2026-08-09', '2026-08-11'), 2, 'Health lag should count UTC day boundaries');
const healthy = assessHealth(healthyManifest, { now: '2026-08-11T12:00:00Z', maxLagDays: 2 });
assert.strictEqual(healthy.ok, true, 'A complete fresh manifest should pass');
assert.strictEqual(healthy.assets.length, 5, 'All required assets should be assessed');

const stale = assessHealth(healthyManifest, { now: '2026-08-12T00:00:00Z', maxLagDays: 2 });
assert.strictEqual(stale.ok, false, 'A manifest beyond the lag threshold should fail');
assert.strictEqual(stale.errors.filter(message => message.includes('3 UTC days behind')).length, 5, 'Every stale asset should be named');

const missing = assessHealth({ ...healthyManifest, assets: healthyManifest.assets.slice(0, 4) }, { now: '2026-08-11T12:00:00Z' });
assert.strictEqual(missing.ok, false, 'A missing required asset should fail');
assert.strictEqual(missing.errors.some(message => message.includes('BNB: missing')), true, 'Missing asset error should be actionable');

const tampered = assessHealth({
  ...healthyManifest,
  assets: healthyManifest.assets.map(entry => entry.coin === 'BTC' ? { ...entry, sha256: 'bad', rows: 12 } : entry),
}, { now: '2026-08-11T12:00:00Z' });
assert.strictEqual(tampered.ok, false, 'Invalid integrity metadata should fail');
assert.strictEqual(tampered.errors.some(message => message.includes('SHA-256')), true, 'Integrity failure should identify SHA-256');

assert.deepStrictEqual(parseArgs(['--url', 'https://example.com/health.json', '--max-lag', '3', '--json']), {
  file: require('path').join(__dirname, '..', 'data', 'health.json'),
  maxLagDays: 3,
  json: true,
  url: 'https://example.com/health.json',
});

console.log('Data health monitor tests passed.');
