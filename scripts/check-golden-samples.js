const fs = require('fs');
const assert = require('assert');

const golden = JSON.parse(fs.readFileSync('data/golden-samples.json','utf8'));
const btc = JSON.parse(fs.readFileSync('data/btc.daily.json','utf8'));
const byDate = new Map(btc.daily.map(row => [row.date,row]));
for(const expected of golden.samples){
  const actual=byDate.get(expected.date);
  assert(actual,`Golden date missing: ${expected.date}`);
  for(const field of ['open','high','low','close','volume']){
    assert.strictEqual(actual[field],expected[field],`${expected.date} ${field} changed: ${actual[field]} !== ${expected[field]}`);
  }
}
console.log(`Golden sample checks passed (${golden.samples.length} BTC dates).`);
