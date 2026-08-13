const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

function browser(initial={}){
  const values=new Map(Object.entries(initial));
  const events=[];
  const scripts=[];
  const context={
    console,
    CustomEvent:function(type,options){this.type=type;this.detail=options?.detail;},
    Date:class extends Date{constructor(value){super(value===undefined?'2026-08-08T12:00:00Z':value);}static now(){return Date.parse('2026-08-08T12:00:00Z');}},
    localStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value))},
    document:{head:{appendChild:node=>scripts.push(node)},createElement:()=>({})},
    dispatchEvent:event=>events.push(event),
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync('assets/retention.js','utf8'),context);
  return {context,values,events,scripts};
}

(async()=>{
  const denied=browser();
  assert.strictEqual(denied.context.BtcBoxPrivacy.consent(),'denied','Analytics must be off by default');
  assert.strictEqual(denied.scripts.length,0,'Default page load must not create the Google Analytics script');

  const calls=[];
  const enabled=browser({
    btcBoxAnalyticsConsent:'granted',
    btcBoxRetentionMilestones:JSON.stringify({firstDate:'2026-08-01',lastDate:'2026-08-07',sent:['d0','d1']})
  });
  enabled.context.gtag=(...args)=>calls.push(args);
  assert.strictEqual(await enabled.context.BtcBoxPrivacy.recordVisit({installed:true,savedCount:4,latestDate:'2026-08-07'}),true);
  assert.strictEqual(await enabled.context.BtcBoxPrivacy.recordVisit({installed:true,savedCount:4,latestDate:'2026-08-07'}),false,'Same UTC day must not report twice');
  const payload=calls.find(call=>call[0]==='event'&&call[1]==='retention_milestone');
  assert(payload,'D7 retention event should be emitted after opt-in');
  assert.strictEqual(payload[2].milestone,'d7');
  assert.strictEqual(payload[2].saved_query_bucket,'3-5');
  assert.strictEqual(payload[2].installed,'yes');
  assert.deepStrictEqual(Object.keys(payload[2]).sort(),['data_fresh','installed','milestone','saved_query_bucket'],'Only coarse approved fields may be sent');

  enabled.context.BtcBoxPrivacy.setConsent('denied');
  assert.strictEqual(enabled.context.BtcBoxPrivacy.consent(),'denied');
  assert.strictEqual(await enabled.context.BtcBoxPrivacy.recordVisit({installed:false,savedCount:0}),false,'Revocation must stop later events');
  console.log('Retention privacy tests passed.');
})().catch(error=>{console.error(error);process.exit(1);});
