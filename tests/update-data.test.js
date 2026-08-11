const fs = require('fs');
const {
  addDerivedFields,
  buildHealthManifest,
  keepCompletedUtcDays,
  utcDay,
  validate,
} = require('../update-btc-data');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: ${actual} !== ${expected}`);
  }
}

const now = new Date('2026-08-10T04:10:14.000Z');
const sourceRows = [
  { date: '2026-08-08', open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { date: '2026-08-09', open: 105, high: 112, low: 101, close: 108, volume: 12 },
  { date: '2026-08-10', open: 108, high: 109, low: 102, close: 103, volume: 4 },
];

assertEqual(utcDay(now), '2026-08-10', 'UTC day should be stable');

const completedRows = keepCompletedUtcDays(sourceRows, now);
assertEqual(completedRows.length, 2, 'Current UTC candle must be excluded');
assertEqual(completedRows.at(-1).date, '2026-08-09', 'Latest row must be the last completed UTC day');

const derivedRows = addDerivedFields(completedRows);
assertEqual(derivedRows.at(-1).next1, null, 'Latest completed candle must not have a future return');
assertEqual(derivedRows[0].next1, 2.86, 'Completed candles should retain derived future returns');

validate(derivedRows, 'TEST-USD');

const health = buildHealthManifest([{
  coin: 'BTC',
  name: 'Bitcoin',
  symbol: 'BTC-USD',
  data_through: '2026-08-09',
  last_checked_at: now.toISOString(),
  source: { ohlcv: 'Yahoo Finance BTC-USD' },
  daily: derivedRows,
}], now.toISOString());
assertEqual(health.assets[0].rows, 2, 'Health manifest should expose the validated row count');
assertEqual(health.assets[0].data_through, '2026-08-09', 'Health manifest should expose the latest completed candle');

const publishedHealth = JSON.parse(fs.readFileSync('data/health.json', 'utf8'));
assertEqual(publishedHealth.assets.length, 5, 'Published health manifest should include all five assets');
for (const asset of publishedHealth.assets) {
  const dataset = JSON.parse(fs.readFileSync(`data/${asset.coin.toLowerCase()}.daily.json`, 'utf8'));
  assertEqual(asset.data_through, dataset.data_through, `${asset.coin} health date should match its dataset`);
  assertEqual(asset.rows, dataset.daily.length, `${asset.coin} health row count should match its dataset`);
}

console.log('update data checks passed');
