const fs=require('fs');
const assert=require('assert');

function jsonLd(file){
  const html=fs.readFileSync(file,'utf8');
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
}

const methodology=jsonLd('methodology.html');
assert.strictEqual(methodology.length,1,'Methodology must expose one unambiguous JSON-LD graph');
const graph=methodology[0]['@graph'];
assert(Array.isArray(graph),'Methodology JSON-LD must use a graph');
const dataset=graph.find(item=>item['@type']==='Dataset');
assert(dataset,'Methodology must identify the public downloads as a Dataset');
assert.strictEqual(dataset.isAccessibleForFree,true);
assert(dataset.measurementTechnique.includes('UTC daily candles'));
const distributions=dataset.distribution.filter(item=>item['@type']==='DataDownload');
assert.strictEqual(distributions.length,6,'Dataset must expose five asset files plus the health manifest');
for(const coin of ['btc','eth','sol','doge','bnb']){
  assert(distributions.some(item=>item.contentUrl===`https://www.mybtcbox.com/data/${coin}.daily.json`),`${coin.toUpperCase()} public JSON distribution missing`);
}
assert(distributions.some(item=>item.contentUrl.endsWith('/data/health.json')),'Dataset health manifest distribution missing');
for(const distribution of distributions){
  assert.strictEqual(distribution.encodingFormat,'application/json');
  assert(distribution.contentUrl.startsWith('https://www.mybtcbox.com/'));
}
console.log('Structured data checks passed.');
