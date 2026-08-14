const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const csvPath = path.join(root, 'docs', 'templates', 'weekly-evidence-template.csv');
const guidePath = path.join(root, 'docs', 'templates', 'weekly-evidence-guide.md');
const observationCsvPath = path.join(root, 'docs', 'evidence', '30-day-observation-2026-08-14.csv');
const observationPlanPath = path.join(root, 'docs', 'evidence', '30-day-observation-2026-08-14.md');
const rows = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
assert.strictEqual(rows.length, 1, 'Weekly evidence template must contain a header only.');

const headers = rows[0].split(',');
const required = [
  'week_start_utc','week_end_utc',
  'github_daily_update_scheduled','github_daily_update_successful','github_daily_update_success_rate_pct',
  'online_checks_scheduled','online_checks_successful','online_check_success_rate_pct',
  'recovery_incidents','recovery_completed','recovery_minutes_total',
  'indexed_tool_urls','eligible_tool_urls','organic_impressions','organic_clicks','organic_ctr_pct',
  'd0_users','d1_eligible_users','d1_returning_users','d7_eligible_users','d7_returning_users','d30_eligible_users','d30_returning_users',
  'evidence_refs','limitations',
];
assert.deepStrictEqual(headers, required, 'Weekly evidence fields must remain stable.');

for (const field of ['name','email','phone','wallet','ip','user_id','client_id','cookie','fingerprint']) {
  assert(!headers.includes(field), `Identity-level field is forbidden: ${field}`);
}

const guide = fs.readFileSync(guidePath, 'utf8');
for (const phrase of ['每周固定一次','不得预填','完整 7 个 UTC 日','完整 30 个 UTC 日','不得进入 D7 分母','Search Console','不提高评分']) {
  assert(guide.includes(phrase), `Weekly evidence guide is missing: ${phrase}`);
}

const observationRows = fs.readFileSync(observationCsvPath, 'utf8').trim().split(/\r?\n/);
assert.strictEqual(observationRows.length, 1, 'A new observation window must start without invented weekly data.');
assert.strictEqual(observationRows[0], rows[0], 'Observation ledger must use the controlled weekly template fields.');
const observationPlan = fs.readFileSync(observationPlanPath, 'utf8');
for (const phrase of ['2026-09-13 UTC','当前仅有表头','不得进入 D7 分母','评分保持不变']) {
  assert(observationPlan.includes(phrase), `Observation plan is missing: ${phrase}`);
}
console.log('Weekly evidence template checks passed.');
