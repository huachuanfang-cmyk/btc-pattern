const assert = require('assert');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'docs', 'templates', 'user-test-template.csv');
const guidePath = path.join(__dirname, '..', 'docs', 'templates', 'user-test-guide.md');
const csv = fs.readFileSync(templatePath, 'utf8').trim();
const rows = csv.split(/\r?\n/);
assert.strictEqual(rows.length, 1, 'The user-test template must be blank except for its header.');

const headers = rows[0].split(',');
const required = [
  'session_date','participant_code','target_user_confirmed','first_visit_confirmed','consent_confirmed',
  'ten_second_verbatim','mentions_historical_data','no_prediction_assumption','names_specific_use','positioning_pass',
  'task_1','task_1_seconds','task_1_completed','task_1_friction',
  'task_2','task_2_seconds','task_2_completed','task_2_friction',
];
assert.deepStrictEqual(headers, required, 'Template fields must remain stable and auditable.');

const forbidden = ['name','email','phone','wallet','address','ip','user_agent','device_id','fingerprint'];
for (const field of forbidden) assert(!headers.includes(field), `PII field is forbidden: ${field}`);

const guide = fs.readFileSync(guidePath, 'utf8');
for (const phrase of ['只看 10 秒','记录原话','不得提示','至少 5','80%','不得记录姓名','不提高评分']) {
  assert(guide.includes(phrase), `User-test guide is missing: ${phrase}`);
}
console.log('User-test template checks passed.');
