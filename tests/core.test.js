const assert = require('assert');
const {
  btcCycleContext,
  dailyObservationContext,
  nextDailyVisit,
  queryMatchesLatest,
  utcAddDays,
  utcDayDiff,
} = require('../assets/core.js');

assert.strictEqual(utcDayDiff('2024-02-28', '2024-03-01'), 2, 'UTC day difference should cross leap day exactly');
assert.strictEqual(utcDayDiff('2026-08-11', '2026-08-10'), 0, 'Negative elapsed time should clamp to zero');
assert.strictEqual(utcAddDays('2024-02-28', 2), '2024-03-01', 'UTC date addition should cross leap day exactly');
assert.strictEqual(utcAddDays('2025-12-31', 1), '2026-01-01', 'UTC date addition should cross year boundary');

const rows = [
  { date: '2026-01-01', high: 100, close: 90, pct: -5 },
  { date: '2026-01-02', high: 95, close: 80, pct: -11.11 },
  { date: '2026-01-03', high: 90, close: 75, pct: -6.25 },
];
const cycle = btcCycleContext(rows);
assert.strictEqual(cycle.peak.date, '2026-01-01', 'Cycle context should select the highest intraday price');
assert.strictEqual(cycle.peakPrice, 100, 'Cycle context should retain the exact peak price');
assert.strictEqual(cycle.daysSincePeak, 2, 'Cycle context should count complete UTC days');
assert.strictEqual(cycle.drawdown, -25, 'Cycle context should calculate close-to-peak drawdown');

const observation = dailyObservationContext(rows);
assert.strictEqual(observation.previous.date, '2026-01-02', 'Daily observation should include the preceding row');
assert.strictEqual(observation.dailyMove, -6.25, 'Daily observation should retain the published daily move');
assert.ok(Math.abs(observation.previousDrawdown - (-20)) < 1e-10, 'Previous drawdown should use the same peak denominator');
assert.ok(Math.abs(observation.drawdownChange - (-5)) < 1e-10, 'Drawdown change should compare consecutive closes');

const firstVisit = nextDailyVisit(null, '2026-08-09');
assert.deepStrictEqual(firstVisit, { lastDate: '2026-08-09', streak: 1, totalDays: 1 });
const nextVisit = nextDailyVisit(firstVisit, '2026-08-10');
assert.deepStrictEqual(nextVisit, { lastDate: '2026-08-10', streak: 2, totalDays: 2 });
assert.deepStrictEqual(nextDailyVisit(nextVisit, '2026-08-10'), nextVisit, 'A repeat visit on the same data day should not inflate totals');
assert.deepStrictEqual(nextDailyVisit(nextVisit, '2026-08-12'), { lastDate: '2026-08-12', streak: 1, totalDays: 3 }, 'A missed data day should reset the streak but retain the total');

assert.strictEqual(queryMatchesLatest({ pct: -8 }, { type: 'drop', threshold: 8 }), true, 'Drop query should include its threshold');
assert.strictEqual(queryMatchesLatest({ pct: 8 }, { type: 'rise', threshold: 8 }), true, 'Rise query should include its threshold');
assert.strictEqual(queryMatchesLatest({ high: 110, low: 100 }, { type: 'range', threshold: 9 }), true, 'Range query should derive amplitude when the prepared field is absent');
assert.strictEqual(queryMatchesLatest({ close: 108, low: 100 }, { type: 'wick', threshold: 7 }), true, 'Wick query should derive low-to-close recovery when the prepared field is absent');
assert.strictEqual(queryMatchesLatest({ pct: 1 }, { type: 'unknown', threshold: 1 }), false, 'Unknown query types should never trigger');

console.log('Core calculation tests passed.');
