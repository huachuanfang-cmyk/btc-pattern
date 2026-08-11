const assert = require('assert');
const {
  addUtcDays,
  backtestDrawdowns,
  buyStats,
  findDrawdowns,
  monthlyReturns,
  monthlyTriggers,
  nearestDaily,
  tieredStats,
  weeklyRows,
  yearlyBacktest,
} = require('../assets/backtest-core.js');

const rows = [
  { date: '2024-01-01', close: 100, low: 99, pct: 0, prevClose: null },
  { date: '2024-01-02', close: 90, low: 85, pct: -10, prevClose: 100 },
  { date: '2024-01-08', close: 95, low: 89, pct: 5.56, prevClose: 90 },
  { date: '2024-01-15', close: 80, low: 75, pct: -15.79, prevClose: 95 },
  { date: '2024-12-31', close: 120, low: 79, pct: 50, prevClose: 80 },
  { date: '2025-01-01', close: 110, low: 100, pct: -8.33, prevClose: 120 },
  { date: '2025-01-08', close: 130, low: 105, pct: 18.18, prevClose: 110 },
];

assert.strictEqual(addUtcDays('2024-02-28', 2), '2024-03-01', 'Backtest date stepping should preserve UTC leap days');
assert.strictEqual(nearestDaily(rows, '2024-01-03').date, '2024-01-08', 'Scheduled buys should use the first available daily candle on or after the target');
assert.strictEqual(nearestDaily(rows, '2026-01-01'), null, 'Dates beyond the dataset should not produce a buy');
assert.deepStrictEqual(weeklyRows(rows, '2024-01-01', '2024-01-15').map(row => row.date), ['2024-01-01', '2024-01-08', '2024-01-15'], 'Weekly DCA should avoid duplicate nearest candles');

const simple = buyStats([rows[1], rows[3]], 100, 130);
assert.strictEqual(simple.count, 2, 'Simple strategy should count qualifying buy days');
assert.strictEqual(simple.invested, 200, 'Simple strategy invested capital should equal buys times amount');
assert.ok(Math.abs(simple.btc - (100 / 90 + 100 / 80)) < 1e-12, 'Simple strategy should accumulate at each daily close');
assert.ok(Math.abs(simple.currentValue - simple.btc * 130) < 1e-12, 'Simple strategy should value holdings at the explicit valuation price');

const tiered = tieredStats(rows, [{ threshold: 5, amount: 50 }, { threshold: 10, amount: 100 }], 130);
assert.strictEqual(tiered.count, 3, 'Tiered strategy should count unique days with at least one triggered level');
assert.strictEqual(tiered.buys, 6, 'Tiered strategy should count every filled level');
assert.strictEqual(tiered.invested, 450, 'Tiered strategy should sum the configured amount for every fill');

const yearly = yearlyBacktest(rows, { startDate: '2024-01-02', tiered: false, rules: [], amount: 100, threshold: 8 });
assert.strictEqual(yearly[2024].stratTriggers, 2, 'First backtest year should begin at the selected date');
assert.strictEqual(yearly[2025].stratTriggers, 1, 'Later years should use the full available year segment');
assert.strictEqual(yearly[2025].winner, yearly[2025].stratROI > yearly[2025].dcaROI ? 'strat' : 'dca', 'Yearly winner should use cumulative ROI');

const triggers = monthlyTriggers(rows, '2024-01-02', 8);
assert.strictEqual(triggers[0].triggers, 3, 'January seasonality should count threshold events across eligible years');
assert.strictEqual(triggers.slice(1).reduce((sum, month) => sum + month.triggers, 0), 0, 'Other months should remain empty for this fixture');

const monthly = monthlyReturns(rows, { startDate: '2024-01-02', tiered: false, rules: [], amount: 100, threshold: 8 });
assert.strictEqual(monthly[0].stratCount, 2, 'Monthly returns should retain one strategy sample per eligible January');
assert.strictEqual(monthly[0].dcaCount, 2, 'Monthly returns should retain one DCA sample per eligible January');

assert.deepStrictEqual(findDrawdowns([]), { maxDd: 0, count20: 0 }, 'Empty portfolios should have a neutral drawdown result');
assert.deepStrictEqual(findDrawdowns([100, 80, 90, 60]), { maxDd: -40, count20: 2 }, 'Drawdown should use the running portfolio peak');
const drawdowns = backtestDrawdowns(rows, { startDate: '2024-01-02', tiered: false, rules: [], amount: 100, threshold: 8 });
assert.strictEqual(Number.isFinite(drawdowns.strat.maxDd), true, 'Strategy drawdown should always be finite');
assert.strictEqual(Number.isFinite(drawdowns.dca.maxDd), true, 'DCA drawdown should always be finite');

console.log('Backtest core tests passed.');
