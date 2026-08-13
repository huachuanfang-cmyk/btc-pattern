const assert = require('assert');
const dataset = require('../data/btc.daily.json');
const example = require('../data/reproducible-example.json');

const rows = dataset.daily;
const byDate = date => rows.find(row => row.date === date);
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const roundedPct = (end, start) => Math.round((end / start - 1) * 10000) / 100;
const event = byDate(example.event_date);
const previous = byDate(addDays(example.event_date, -1));

assert(event, 'Reproducible event date must exist in BTC dataset');
assert(previous, 'Previous UTC daily candle must exist');
const expectedInputs = {
  previous_close: previous.close,
  high: event.high,
  low: event.low,
  close: event.close,
  next_1_close: byDate(addDays(example.event_date, 1)).close,
  next_7_close: byDate(addDays(example.event_date, 7)).close,
  next_30_close: byDate(addDays(example.event_date, 30)).close
};
assert.deepStrictEqual(example.inputs, expectedInputs, 'Published example inputs must match the public BTC dataset');

const expectedOutputs = {
  close_change_pct: roundedPct(event.close, previous.close),
  intraday_range_pct: roundedPct(event.high, event.low),
  low_to_close_pct: roundedPct(event.close, event.low),
  next_1_pct: roundedPct(expectedInputs.next_1_close, event.close),
  next_7_pct: roundedPct(expectedInputs.next_7_close, event.close),
  next_30_pct: roundedPct(expectedInputs.next_30_close, event.close)
};
assert.deepStrictEqual(example.outputs, expectedOutputs, 'Published example outputs must reproduce from the public inputs');
console.log('Reproducible methodology example passed.');
