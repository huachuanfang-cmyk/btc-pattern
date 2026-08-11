const fs = require('fs');

const file = 'quality-scorecard.json';
const scorecard = JSON.parse(fs.readFileSync(file, 'utf8'));
const expectedIds = [
  'positioning', 'core-tools', 'data-expression', 'reports', 'mobile',
  'correctness', 'retention', 'seo', 'data-operations', 'extensibility'
];

if (scorecard.target < 9.5) throw new Error('Quality target must be at least 9.5.');
if (scorecard.dimensions.length !== expectedIds.length) throw new Error('Scorecard must contain exactly ten dimensions.');

const ids = scorecard.dimensions.map(item => item.id);
for (const id of expectedIds) {
  if (!ids.includes(id)) throw new Error(`Missing quality dimension: ${id}`);
}
if (new Set(ids).size !== ids.length) throw new Error('Quality dimension IDs must be unique.');

for (const item of scorecard.dimensions) {
  if (!Number.isFinite(item.baseline) || !Number.isFinite(item.current)) throw new Error(`${item.id} has an invalid score.`);
  if (item.baseline < 0 || item.baseline > 10 || item.current < 0 || item.current > 10) throw new Error(`${item.id} score must be between 0 and 10.`);
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) throw new Error(`${item.id} must include evidence.`);
  if (!item.nextMilestone) throw new Error(`${item.id} must include a next milestone.`);
  for (const evidence of item.evidence) {
    if (!fs.existsSync(evidence)) throw new Error(`${item.id} evidence does not exist: ${evidence}`);
  }
}

console.table(scorecard.dimensions.map(item => ({
  dimension: item.name,
  current: item.current.toFixed(1),
  target: scorecard.target.toFixed(1),
  gap: Math.max(0, scorecard.target - item.current).toFixed(1)
})));
console.log('quality scorecard checks passed');
