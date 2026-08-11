const assert = require('assert');
const {
  average,
  buckets,
  dateDiff,
  drawdowns,
  extremes,
  maxBy,
  minBy,
  seasonality,
  streaks,
  yearly,
} = require('../assets/report-core.js');

const rows = [
  { date: '2023-12-31', open: 98, high: 105, low: 95, close: 100, pct: null, rise_to_high: null, drop_to_low: null },
  { date: '2024-01-01', open: 100, high: 115, low: 99, close: 110, pct: 10, rise_to_high: 15, drop_to_low: -1 },
  { date: '2024-01-02', open: 110, high: 112, low: 80, close: 88, pct: -20, rise_to_high: 1.82, drop_to_low: -27.27 },
  { date: '2024-01-03', open: 88, high: 90, low: 65, close: 70, pct: -20.45, rise_to_high: 2.27, drop_to_low: -26.14 },
  { date: '2024-02-01', open: 70, high: 86, low: 69, close: 84, pct: 20, rise_to_high: 22.86, drop_to_low: -1.43 },
  { date: '2024-02-02', open: 84, high: 102, low: 82, close: 100, pct: 19.05, rise_to_high: 21.43, drop_to_low: -2.38 },
  { date: '2025-01-01', open: 100, high: 101, low: 48, close: 50, pct: -50, rise_to_high: 1, drop_to_low: -52 },
];

assert.strictEqual(average([null, 2, 4, NaN]), 3, 'Average should ignore non-finite values');
assert.strictEqual(maxBy(rows, row => row.high).date, '2024-01-01', 'Max selector should return the matching row');
assert.strictEqual(minBy(rows, row => row.low).date, '2025-01-01', 'Min selector should return the matching row');
assert.strictEqual(dateDiff('2024-02-28', '2024-03-01'), 2, 'Report date differences should preserve leap days');

const ext = extremes(rows);
assert.strictEqual(ext.ath.date, '2024-01-01', 'Report ATH should use intraday high');
assert.strictEqual(ext.atl.date, '2025-01-01', 'Report ATL should use intraday low');
assert.strictEqual(ext.maxRise.date, '2024-02-01', 'Maximum rise should use high versus prior close when available');
assert.strictEqual(ext.maxDrop.date, '2025-01-01', 'Maximum drop should use low versus prior close when available');
assert.strictEqual(ext.totalReturn, -50, 'Total return should compare first and latest closes');

const distribution = buckets(rows);
assert.strictEqual(distribution.reduce((sum, bucket) => sum + bucket.count, 0), 6, 'Every finite daily move should belong to exactly one bucket');
assert.strictEqual(distribution.find(bucket => bucket.label === '< -10%').count, 3, 'Large negative bucket should include all moves below -10%');

const run = streaks(rows);
assert.strictEqual(run.maxUp, 2, 'Report should identify the longest up streak');
assert.strictEqual(run.maxDown, 2, 'Report should identify the longest down streak across the date sequence');
assert.strictEqual(run.upBucket.d2, 1, 'Two-day up streak should be counted once');
assert.strictEqual(run.downBucket.d2, 1, 'Two-day down streak should be counted once');

const annual = yearly(rows);
assert.ok(Math.abs(annual.find(entry => entry.year === '2024').ret) < 1e-12, 'Full-year return should use the prior year close as its base');
assert.strictEqual(annual.find(entry => entry.year === '2025').label, '2025 YTD', 'Latest year should be marked YTD');

const decline = drawdowns(rows);
assert.strictEqual(decline.count20, 1, 'One unrecovered 20% drawdown period should count once');
assert.ok(Math.abs(decline.worst.dd - (-54.54545454545454)) < 1e-10, 'Worst drawdown should use the running close peak');
assert.deepStrictEqual(drawdowns([]), { worst: null, count20: 0, avgDays: null, top: [] }, 'Empty reports should return a complete neutral drawdown shape');

const months = seasonality(rows);
assert.strictEqual(months[0].count, 2, 'January seasonality should contain two complete samples');
assert.ok(Math.abs(months[0].avg - (-40)) < 1e-10, 'January average should use prior month closes for both samples');
assert.strictEqual(months[1].count, 1, 'February seasonality should contain one complete sample');

console.log('Report core tests passed.');
