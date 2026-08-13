const fs = require('fs');
const { execFileSync } = require('child_process');

const PAIRS={BTC:'XBTUSD',ETH:'ETHUSD',SOL:'SOLUSD',DOGE:'DOGEUSD',BNB:'BNBUSD'};
const MAX_CLOSE_DIFF_PCT=3;
const MAX_RANGE_DIFF_PCT=5;

function dayFromUnix(seconds){ return new Date(Number(seconds)*1000).toISOString().slice(0,10); }
function differencePct(a,b){ return Math.abs(a/b-1)*100; }

async function fetchKraken(pair,since){
  const url=`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440&since=${since}`;
  if(process.platform==='win32') return fetchKrakenWithPowerShell(pair,url);
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),10000);
      let response;
      try{ response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'MyBTCBox/1.0 cross-check'},signal:controller.signal}); }
      finally{ clearTimeout(timeout); }
      if(!response.ok) throw new Error(`Kraken HTTP ${response.status}`);
      const body=await response.json();
      if(body.error?.length) throw new Error(body.error.join(', '));
      const key=Object.keys(body.result||{}).find(name => name!=='last');
      return key ? body.result[key] : [];
    }catch(error){
      lastError=error;
      if(attempt<3) await new Promise(resolve=>setTimeout(resolve,attempt*750));
    }
  }
  throw new Error(`${pair}: Kraken unavailable after retries (${lastError?.message||lastError})`);
}

function fetchKrakenWithPowerShell(pair,url){
  let lastError;
  const escaped=url.replace(/'/g,"''");
  const command=`$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -Uri '${escaped}' -Headers @{'User-Agent'='MyBTCBox/1.0 cross-check';'Accept'='application/json'} -UseBasicParsing -TimeoutSec 20).Content`;
  for(const shell of ['C:\\Program Files\\PowerShell\\7\\pwsh.exe','powershell.exe']){
    try{
      const body=JSON.parse(execFileSync(shell,['-NoProfile','-Command',command],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024}));
      if(body.error?.length) throw new Error(body.error.join(', '));
      const key=Object.keys(body.result||{}).find(name=>name!=='last');
      return key ? body.result[key] : [];
    }catch(error){ lastError=error; }
  }
  throw new Error(`${pair}: Kraken unavailable (${lastError?.message||lastError})`);
}

async function main(){
  const results=[];
  for(const [coin,pair] of Object.entries(PAIRS)){
    const dataset=JSON.parse(fs.readFileSync(`data/${coin.toLowerCase()}.daily.json`,'utf8'));
    const target=dataset.daily.at(-1);
    const since=Math.floor(new Date(`${target.date}T00:00:00Z`).getTime()/1000)-86400;
    const rows=await fetchKraken(pair,since);
    const row=rows.find(item => dayFromUnix(item[0])===target.date);
    if(!row) throw new Error(`${coin}: Kraken has no ${target.date} UTC candle`);
    const reference={open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])};
    const closeDiff=differencePct(target.close,reference.close);
    const highDiff=differencePct(target.high,reference.high);
    const lowDiff=differencePct(target.low,reference.low);
    if(closeDiff>MAX_CLOSE_DIFF_PCT || highDiff>MAX_RANGE_DIFF_PCT || lowDiff>MAX_RANGE_DIFF_PCT){
      throw new Error(`${coin} ${target.date}: cross-source difference too large (close ${closeDiff.toFixed(2)}%, high ${highDiff.toFixed(2)}%, low ${lowDiff.toFixed(2)}%)`);
    }
    results.push({coin,date:target.date,closeDiffPct:Number(closeDiff.toFixed(3)),highDiffPct:Number(highDiff.toFixed(3)),lowDiffPct:Number(lowDiff.toFixed(3)),primary:dataset.symbol,reference:pair});
  }
  const report={checked_at:new Date().toISOString(),primary_source:'Yahoo Finance UTC daily',reference_source:'Kraken UTC daily',tolerances:{close_pct:MAX_CLOSE_DIFF_PCT,high_low_pct:MAX_RANGE_DIFF_PCT},results};
  fs.writeFileSync('data/cross-check-latest.json',JSON.stringify(report,null,2)+'\n');
  console.table(results);
  console.log('Cross-source market data checks passed.');
}

main().catch(error=>{console.error(error.message||error);process.exit(1);});
