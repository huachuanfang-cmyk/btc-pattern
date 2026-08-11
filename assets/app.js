const RAW_COINS = window.CRYPTO_DAILY_DATA?.coins || {};
const {
  btcCycleContext: coreBtcCycleContext,
  dailyObservationContext: coreDailyObservationContext,
  nextDailyVisit,
  queryMatchesLatest,
  utcAddDays,
  utcDayDiff
} = window.MYBTCBOX_CORE;
const COIN_ORDER = ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB'];
const COIN_DISPLAY = {
  BTC:{en:'Bitcoin',zh:'比特币'},
  ETH:{en:'Ethereum',zh:'以太坊'},
  SOL:{en:'Solana',zh:'Solana'},
  DOGE:{en:'Dogecoin',zh:'狗狗币'},
  BNB:{en:'BNB',zh:'BNB'}
};
COIN_ORDER.forEach(code => {
  const key = code + '_DAILY_DATA';
  if (window[key]) {
    RAW_COINS[code] = window[key];
    RAW_COINS[code]._ath = RAW_COINS[code].daily.reduce((m, d) => Math.max(m, d.high || d.close || 0), 0);
  }
});
if (!RAW_COINS?.BTC || !Array.isArray(RAW_COINS.BTC.daily)) {
  throw new Error('Crypto daily data failed to load. Make sure data/btc.daily.js exists next to this HTML file.');
}
const PAGE_PARAMS = new URLSearchParams(window.location?.search || '');
const PAGE_PRESET = window.MYBTCBOX_PRESET || {};
const savedCoin = localStorage.getItem('btcPatternCoin');
const urlCoin = (PAGE_PARAMS.get('asset') || PAGE_PRESET.asset || '').toUpperCase();
const requestedCoin = COIN_ORDER.includes(urlCoin) ? urlCoin : COIN_ORDER.includes(savedCoin) ? savedCoin : 'BTC';
const PX = 'https://mybtcbox-proxy.huachuanfang.workers.dev/api?url=';
let activeCoin = 'BTC';
let BTC_DAILY_RAW = RAW_COINS[activeCoin];
function bRound(n, d=2){ return n == null || !Number.isFinite(n) ? null : Math.round(n * 10**d) / 10**d; }
function bPct(a,b){ return !a || !b ? null : bRound((a / b - 1) * 100, 2); }
function priceRound(n){
  if(n == null || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.1 ? 5 : a >= 0.01 ? 6 : 8;
  return bRound(n, d);
}
function fmtPrice(v){
  if(v == null || !Number.isFinite(v)) return '-';
  const n = Number(v);
  const a = Math.abs(n);
  const d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.1 ? 4 : a >= 0.01 ? 5 : a >= 0.001 ? 6 : 8;
  return (n < 0 ? '-' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtDollars(v){ return v == null || !Number.isFinite(v) ? '-' : '$' + Math.round(v).toLocaleString('en-US'); }
function buildBtcData(source){
  const rows = source.daily.map(d => ({
    date: d.date,
    open: +d.open,
    high: +d.high,
    low: +d.low,
    close: +d.close,
    volume: +(d.volume || 0)
  })).filter(d => d.date && d.open && d.high && d.low && d.close).sort((a,b)=>a.date.localeCompare(b.date));

  rows.forEach((d,i) => {
    d.prev_close = i > 0 ? rows[i-1].close : null;
    d.pct_raw = d.prev_close ? (d.close / d.prev_close - 1) * 100 : null;
    d.pct = d.pct_raw == null ? null : bRound(d.pct_raw, 2);
    d.close_pct = d.pct;
    d.range_pct_raw = (d.high / d.low - 1) * 100;
    d.range_pct = bRound(d.range_pct_raw, 2);
    d.low_to_close_raw = (d.close / d.low - 1) * 100;
    d.low_to_close = bRound(d.low_to_close_raw, 2);
    d.drop_to_low_raw = d.prev_close ? (d.low / d.prev_close - 1) * 100 : null;
    d.drop_to_low = d.drop_to_low_raw == null ? null : bRound(d.drop_to_low_raw, 2);
    d.rise_to_high_raw = d.prev_close ? (d.high / d.prev_close - 1) * 100 : null;
    d.rise_to_high = d.rise_to_high_raw == null ? null : bRound(d.rise_to_high_raw, 2);
    d.wick_depth = d.low_to_close;
    d.wick_depth_raw = d.low_to_close_raw;
  });

  const futureRaw = (i,n) => rows[i+n] ? (rows[i+n].close / rows[i].close - 1) * 100 : null;
  const future = (i,n) => {
    const value = futureRaw(i,n);
    return value == null ? null : bRound(value, 2);
  };
  const base = (d,i) => ({
    date:d.date, open:priceRound(d.open), high:priceRound(d.high), low:priceRound(d.low), close:priceRound(d.close),
    pct:d.pct, next1:future(i,1), next7:future(i,7), next30:future(i,30),
    next1_raw:futureRaw(i,1), next7_raw:futureRaw(i,7), next30_raw:futureRaw(i,30),
    range_pct:d.range_pct, wick_depth:d.wick_depth, low_to_close:d.low_to_close,
    drop_to_low:d.drop_to_low, rise_to_high:d.rise_to_high,
    pct_raw:d.pct_raw, range_pct_raw:d.range_pct_raw, wick_depth_raw:d.wick_depth_raw,
    low_to_close_raw:d.low_to_close_raw, drop_to_low_raw:d.drop_to_low_raw, rise_to_high_raw:d.rise_to_high_raw,
    volume:Math.round(d.volume || 0)
  });
  const desc = (a,b) => b.date.localeCompare(a.date);
  const daily = rows.map(base);
  const drops = daily.filter(d => d.pct_raw != null && d.pct_raw < 0).sort(desc);
  const rises = daily.filter(d => d.pct_raw != null && d.pct_raw >= 0).sort(desc);
  const intraday = rows.map((d,i)=>({
    date:d.date, open:priceRound(d.open), high:priceRound(d.high), low:priceRound(d.low), close:priceRound(d.close),
    close_pct:d.close_pct, range_pct:d.range_pct, low_to_close:d.low_to_close, drop_to_low:d.drop_to_low,
    range_pct_raw:d.range_pct_raw, low_to_close_raw:d.low_to_close_raw,
    next1:future(i,1), next7:future(i,7), next30:future(i,30),
    next1_raw:futureRaw(i,1), next7_raw:futureRaw(i,7), next30_raw:futureRaw(i,30),
    volume:Math.round(d.volume || 0)
  })).filter(d => d.range_pct_raw >= 5).sort(desc);
  const wickEvents = rows.map((d,i)=>({
    date:d.date, low:priceRound(d.low), close:priceRound(d.close), wick_depth:d.wick_depth, range_pct:d.range_pct,
    day_pct:d.pct, wick_depth_raw:d.wick_depth_raw, low_to_close_raw:d.low_to_close_raw,
    next1:future(i,1), next7:future(i,7), next30:future(i,30),
    next1_raw:futureRaw(i,1), next7_raw:futureRaw(i,7), next30_raw:futureRaw(i,30),
    volume:Math.round(d.volume || 0)
  })).filter(d => d.wick_depth_raw >= 3).sort(desc);

  function stat(selected){
    const values = k => selected.map(e => e[k + '_raw'] ?? e[k]).filter(Number.isFinite);
    const valid = k => values(k);
    const upPct = k => { const v = values(k); return v.length ? bRound(v.filter(n => n > 0).length / v.length * 100, 1) : null; };
    const avg = k => { const v = values(k); return v.length ? bRound(v.reduce((s,n)=>s+n,0) / v.length, 2) : null; };
    const median = k => {
      const v = values(k).sort((a,b)=>a-b);
      if(!v.length) return null;
      const mid = Math.floor(v.length / 2);
      return bRound(v.length % 2 ? v[mid] : (v[mid-1] + v[mid]) / 2, 2);
    };
    const ltc = selected.filter(e => e.low_to_close != null);
    return {
      count:selected.length,
      n1:valid('next1').length, n7:valid('next7').length, n30:valid('next30').length,
      up1_pct:upPct('next1'), up1_avg:avg('next1'),
      up7_pct:upPct('next7'), up7_avg:avg('next7'),
      up30_pct:upPct('next30'), up30_avg:avg('next30'),
      med1:median('next1'), med7:median('next7'), med30:median('next30'),
      ltc_up_pct:ltc.length ? bRound(ltc.filter(e => e.low_to_close > 0).length / ltc.length * 100, 1) : null,
      ltc_1_pct:ltc.length ? bRound(ltc.filter(e => (e.low_to_close_raw ?? e.low_to_close) >= 1).length / ltc.length * 100, 1) : null,
      ltc_avg:ltc.length ? bRound(ltc.reduce((s,e)=>s+e.low_to_close,0) / ltc.length, 2) : null
    };
  }
  function summarize(events, metric, thresholds, mode){
    const out = {};
    for (const th of thresholds) {
      const selected = events.filter(e => {
        const value = e[metric + '_raw'] ?? e[metric];
        return mode === 'lte' ? value <= -th : value >= th;
      });
      out[String(th)] = selected.length ? stat(selected) : null;
    }
    return out;
  }
  return {
    ...source,
    _ath: rows.reduce((m, d) => Math.max(m, d.high || d.close || 0), 0),
    data_through: source.data_through || rows[rows.length-1].date,
    date_range: source.date_range || (rows[0].date + ' to ' + rows[rows.length-1].date),
    daily,
    drops,
    rises,
    intraday,
    wick:{ events:wickEvents, pre:summarize(wickEvents, 'wick_depth', [5,8,10,15,20], 'gte') },
    pre:{
      drop:summarize(daily, 'pct', [3,5,8,10,15,20,30], 'lte'),
      rise:summarize(daily, 'pct', [3,5,8,10,15,20,30], 'gte'),
      range:summarize(intraday, 'range_pct', [5,8,10,15,20,25,30], 'gte')
    }
  };
}
let BTC_DATA = buildBtcData(BTC_DAILY_RAW);

// ── CROSS-COIN COMPARISON ──
const COMP_COLORS = { BTC:'#f7931a', ETH:'#627eea', SOL:'#9945ff', DOGE:'#c2a633', BNB:'#f0b90b' };
const COIN_LOGOS = {
  BTC:'<svg viewBox="0 0 32 32" aria-label="BTC"><circle cx="16" cy="16" r="15" fill="#f7931a"/><text x="16" y="22.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#fff">₿</text></svg>',
  ETH:'<svg viewBox="0 0 32 32" aria-label="ETH"><circle cx="16" cy="16" r="15" fill="#eef2ff"/><path d="M16 4.8l-7 11.6 7 4.2 7-4.2L16 4.8z" fill="#627eea"/><path d="M16 22l-7-4.2 7 9.4 7-9.4L16 22z" fill="#3c3c3d"/><path d="M16 4.8v15.8l7-4.2L16 4.8z" fill="#8a92b2"/><path d="M16 22v5.2l7-9.4L16 22z" fill="#62688f"/></svg>',
  SOL:'<svg viewBox="0 0 32 32" aria-label="SOL"><defs><linearGradient id="solA" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#14f195"/><stop offset=".52" stop-color="#9945ff"/><stop offset="1" stop-color="#00c2ff"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="#0b0f17"/><path d="M9.2 9.2h14.2c.35 0 .53.43.28.68l-2.3 2.3a1.2 1.2 0 0 1-.84.35H6.35a.4.4 0 0 1-.28-.68l2.3-2.3c.22-.22.52-.35.84-.35zm0 10.27h14.2c.35 0 .53.43.28.68l-2.3 2.3a1.2 1.2 0 0 1-.84.35H6.35a.4.4 0 0 1-.28-.68l2.3-2.3c.22-.22.52-.35.84-.35zm16.45-4.13H11.46c-.32 0-.62.13-.84.35l-2.3 2.3a.4.4 0 0 0 .28.68h14.2c.32 0 .62-.13.84-.35l2.3-2.3a.4.4 0 0 0-.28-.68z" fill="url(#solA)"/></svg>',
  DOGE:'<svg viewBox="0 0 32 32" aria-label="DOGE"><circle cx="16" cy="16" r="15" fill="#c2a633"/><path d="M12 7.2h5.2c4.15 0 7 2.72 7 8.75 0 6.1-2.85 8.85-7 8.85H12v-7.2H9.7v-3.2H12V7.2zm3.55 3.35v3.85h3.7v3.2h-3.7v3.85h1.45c2.25 0 3.65-1.55 3.65-5.5 0-3.85-1.42-5.4-3.65-5.4h-1.45z" fill="#fff"/></svg>',
  BNB:'<svg viewBox="0 0 32 32" aria-label="BNB"><circle cx="16" cy="16" r="15" fill="#f0b90b"/><path d="M16 5.6l4.2 4.2-2.45 2.45L16 10.5l-1.75 1.75-2.45-2.45L16 5.6zm-7.1 7.1L11.35 15.15 8.9 17.6l-2.45-2.45L8.9 12.7zm14.2 0l2.45 2.45-2.45 2.45-2.45-2.45 2.45-2.45zM16 14.1l2.45 2.45L16 19l-2.45-2.45L16 14.1zm-4.2 8.1l2.45-2.45L16 21.5l1.75-1.75 2.45 2.45L16 26.4l-4.2-4.2z" fill="#fff"/></svg>'
};
let _snapDate = null; // null = normal history table, string = showing snapshot for this date

let COIN_DATA = {};
// Build data for coins already loaded (initially only BTC)
COIN_ORDER.forEach(code => {
  if (RAW_COINS[code] && RAW_COINS[code].daily) {
    COIN_DATA[code] = buildBtcData(RAW_COINS[code]);
  }
});

const BTC_CYCLE_TIMING = {
  bear:[
    {label:'2013-2015', peak:'2013-11-29', bottom:'2015-01-14', days:411},
    {label:'2017-2018', peak:'2017-12-17', bottom:'2018-12-15', days:363},
    {label:'2021-2022', peak:'2021-11-10', bottom:'2022-11-21', days:376}
  ],
  bull:[
    {label:'2015-2017', low:'2015-01-14', peak:'2017-12-17', days:1068, halvingDays:526},
    {label:'2018-2021', low:'2018-12-15', peak:'2021-11-10', days:1061, halvingDays:548},
    {label:'2022-2025', low:'2022-11-21', peak:'2025-10-06', days:1050, halvingDays:534}
  ]
};
function btcCycleContext(){
  return coreBtcCycleContext(COIN_DATA.BTC?.daily || []);
}
function dailyObservationContext(){
  return coreDailyObservationContext(COIN_DATA.BTC?.daily || []);
}
const DAILY_VISIT_KEY='btcPatternDailyVisit';
let deferredInstallPrompt=null;
let appInstalled=typeof window.matchMedia==='function' && window.matchMedia('(display-mode: standalone)').matches;
if(typeof navigator!=='undefined' && navigator.standalone) appInstalled=true;
if(typeof window.addEventListener==='function'){
  window.addEventListener('beforeinstallprompt',event => {
    event.preventDefault();
    deferredInstallPrompt=event;
    renderDailyObservation();
  });
  window.addEventListener('appinstalled',() => {
    appInstalled=true;
    deferredInstallPrompt=null;
    renderDailyObservation();
  });
}
async function installDailyApp(){
  if(appInstalled){
    toast(lang==='zh' ? '已经固定到主屏幕' : 'Already installed');
    return;
  }
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    if(choice?.outcome==='accepted') appInstalled=true;
    deferredInstallPrompt=null;
    renderDailyObservation();
    return;
  }
  toast(lang==='zh'
    ? '请使用浏览器菜单中的“添加到主屏幕”或“安装应用”'
    : 'Use your browser menu and choose Add to Home Screen or Install App');
}
function updateDailyVisit(latestDate){
  let state={lastDate:null,streak:0,totalDays:0};
  try{
    const saved=JSON.parse(localStorage.getItem(DAILY_VISIT_KEY) || 'null');
    if(saved && typeof saved==='object') state={...state,...saved};
  }catch(e){}
  const next=nextDailyVisit(state,latestDate);
  if(next.lastDate===state.lastDate) return next;
  state=next;
  try{ localStorage.setItem(DAILY_VISIT_KEY,JSON.stringify(state)); }catch(e){}
  return state;
}
function savedQueryTriggered(item){
  const rows=COIN_DATA[item?.coin]?.daily || [];
  const latest=rows[rows.length-1];
  return queryMatchesLatest(latest,item);
}
function dailyHabitContext(latestDate){
  const visit=updateDailyVisit(latestDate);
  const savedCount=Array.isArray(SAVED_QUERIES) ? SAVED_QUERIES.length : 0;
  const triggeredCount=savedCount ? SAVED_QUERIES.filter(savedQueryTriggered).length : 0;
  return {...visit,savedCount,triggeredCount};
}
function viewSavedQueries(){
  document.getElementById('saved-queries')?.scrollIntoView({behavior:'smooth',block:'center'});
}
function renderDailyObservation(){
  const host = document.getElementById('daily-brief');
  if(!host) return;
  const ctx = dailyObservationContext();
  const zh = lang === 'zh';
  host.setAttribute('aria-label', zh ? 'BTC 每日观察摘要' : 'BTC daily observation summary');
  if(!ctx){
    host.innerHTML = `<div class="daily-brief-empty">${zh?'每日观察数据暂时无法读取。':'Daily observation data is temporarily unavailable.'}</div>`;
    return;
  }
  const move = Number.isFinite(ctx.dailyMove) ? ctx.dailyMove : 0;
  const moveAbs = Math.abs(move).toFixed(2);
  const moveWord = zh ? (move > 0 ? '收涨' : move < 0 ? '收跌' : '持平') : (move > 0 ? 'rose' : move < 0 ? 'fell' : 'was unchanged');
  const changeAbs = Math.abs(ctx.drawdownChange).toFixed(2);
  const changeWord = zh
    ? (ctx.drawdownChange < -0.005 ? '扩大' : ctx.drawdownChange > 0.005 ? '收窄' : '基本持平')
    : (ctx.drawdownChange < -0.005 ? 'wider' : ctx.drawdownChange > 0.005 ? 'narrower' : 'nearly unchanged');
  const changeCopy = zh
    ? (changeWord === '基本持平' ? '回撤较前一日基本持平' : `回撤较前一日${changeWord}${changeAbs}个百分点`)
    : (changeWord === 'nearly unchanged' ? 'Drawdown was nearly unchanged from the prior day' : `Drawdown was ${changeAbs} percentage points ${changeWord} than the prior day`);
  const sentence = zh
    ? `BTC 最新完整日线${moveWord}${moveAbs}%，距样本高点回撤${Math.abs(ctx.drawdown).toFixed(1)}%；${changeCopy}，周期计时推进至第${ctx.daysSincePeak}天。`
    : `BTC's latest completed daily candle ${moveWord} ${moveAbs}%. Drawdown from the sample high is ${Math.abs(ctx.drawdown).toFixed(1)}%. ${changeCopy}. The cycle clock is now at day ${ctx.daysSincePeak}.`;
  const habit=dailyHabitContext(ctx.latest.date);
  const habitText=habit.savedCount
    ? (zh
        ? `${habit.streak>1?`连续观察 <strong>${habit.streak}</strong> 个数据日`:'今日开始观察'} · 已保存 <strong>${habit.savedCount}</strong> 个条件，今日 <strong>${habit.triggeredCount}</strong> 个触发`
        : `${habit.streak>1?`Observed <strong>${habit.streak}</strong> data days in a row`:'Observation started today'} · <strong>${habit.savedCount}</strong> saved, <strong>${habit.triggeredCount}</strong> triggered today`)
    : (zh ? '观察记录仅保存在本设备。保存常用查询后，这里会每天核对。' : 'Observation history stays on this device. Save a query to check it here each day.');
  host.innerHTML = `
    <div class="daily-brief-main">
      <div class="daily-brief-head">
        <h2 class="daily-brief-title">${zh?'今日观察':'Daily observation'}</h2>
        <span class="daily-brief-date">${zh?'日线截止':'daily through'} ${ctx.latest.date}</span>
      </div>
      <p class="daily-brief-copy">${sentence}</p>
    </div>
    <div class="daily-brief-metrics">
      <div class="daily-brief-metric">
        <span class="daily-brief-label">${zh?'日线涨跌':'daily move'}</span>
        <strong class="daily-brief-value ${pctClass(move)}">${signedPct(move)}</strong>
      </div>
      <div class="daily-brief-metric">
        <span class="daily-brief-label">${zh?'距样本高点':'from sample high'}</span>
        <strong class="daily-brief-value dn">${ctx.drawdown.toFixed(1)}%</strong>
      </div>
      <div class="daily-brief-metric">
        <span class="daily-brief-label">${zh?'周期计时':'cycle clock'}</span>
        <strong class="daily-brief-value">${ctx.daysSincePeak}${zh?'天':'d'}</strong>
      </div>
    </div>
    <div class="daily-brief-habit" title="${zh?'记录仅保存在本设备':'Stored on this device only'}">
      <span>${habitText}</span>
      <span class="daily-brief-actions">
        ${habit.savedCount?`<button type="button" onclick="viewSavedQueries()">${zh?'查看条件':'View saved queries'}</button>`:''}
        ${appInstalled?'':`<button type="button" onclick="installDailyApp()">${zh?'固定到主屏幕':'Add to home screen'}</button>`}
      </span>
    </div>`;
}
function btcCycleStageComparisons(daysSincePeak){
  const rows = COIN_DATA.BTC?.daily || [];
  const byDate = new Map(rows.map(row => [row.date,row]));
  return BTC_CYCLE_TIMING.bear.map(cycle => {
    const peak = byDate.get(cycle.peak);
    const date = utcAddDays(cycle.peak,daysSincePeak);
    const target = byDate.get(date);
    const peakPrice = peak ? (peak.high || peak.close) : null;
    if(!peakPrice || !target) return null;
    return {
      label:cycle.label,
      date,
      close:target.close,
      drawdown:(target.close / peakPrice - 1) * 100
    };
  }).filter(Boolean).reverse();
}
function renderCycleRuler(){
  const host = document.getElementById('cycle-ruler');
  if(!host) return;
  const ctx = btcCycleContext();
  const zh = lang === 'zh';
  host.setAttribute('aria-label', zh ? 'BTC 历史周期刻度尺' : 'BTC historical cycle ruler');
  if(!ctx){
    host.innerHTML = `<div class="cycle-ruler-title">${zh?'BTC 历史周期刻度尺':'BTC historical cycle ruler'}</div><div class="cycle-ruler-copy">${zh?'周期数据暂时无法读取。':'Cycle data is temporarily unavailable.'}</div>`;
    return;
  }
  const bearDays = BTC_CYCLE_TIMING.bear.map(x=>x.days);
  const bullDays = BTC_CYCLE_TIMING.bull.map(x=>x.days);
  const halvingDays = BTC_CYCLE_TIMING.bull.map(x=>x.halvingDays);
  const bearMin = Math.min(...bearDays), bearMax = Math.max(...bearDays);
  const scaleMax = Math.max(450, Math.ceil((ctx.daysSincePeak + 30) / 50) * 50);
  const pct = n => Math.max(2, Math.min(98, n / scaleMax * 100));
  const rangeLeft = pct(bearMin), rangeRight = pct(bearMax);
  const markerHtml = BTC_CYCLE_TIMING.bear.map(item => `
    <span class="cycle-tick" style="left:${pct(item.days)}%" aria-hidden="true"></span>`).join('');
  const markerDays = BTC_CYCLE_TIMING.bear.map(item => item.days).sort((a,b) => a-b).join(' / ');
  const drawdownText = Number.isFinite(ctx.drawdown) ? `${ctx.drawdown.toFixed(1)}%` : '-';
  const distanceToRange = bearMin - ctx.daysSincePeak;
  const insight = distanceToRange > 0
    ? (zh ? `距历史最早触底样本还有 ${distanceToRange} 天` : `${distanceToRange} days before the earliest historical bottom sample`)
    : ctx.daysSincePeak <= bearMax
      ? (zh ? '当前已进入历史顶部到底部时间区间' : 'Now within the historical peak-to-bottom time range')
      : (zh ? `已超过历史最长样本 ${ctx.daysSincePeak-bearMax} 天` : `${ctx.daysSincePeak-bearMax} days beyond the longest historical sample`);
  host.innerHTML = `
    <div class="cycle-ruler-head">
      <div>
        <h2 class="cycle-ruler-title">${zh?'BTC 历史周期刻度尺':'BTC historical cycle ruler'}</h2>
        <p class="cycle-ruler-copy">${zh?'现在走了多久，过去三轮走了多久。这里只做时间对照，不预测最低点或最高点。':'How long the current move has lasted versus three completed cycles. This is a time comparison, not a bottom or top forecast.'}</p>
      </div>
      <div class="cycle-ruler-date">${zh?'日线截止':'daily through'} ${ctx.latest.date}</div>
    </div>
    <div class="cycle-ruler-metrics">
      <div class="cycle-ruler-metric">
        <div class="cycle-ruler-label">${zh?'最近样本高点':'latest sample high'}</div>
        <div class="cycle-ruler-value">${ctx.peak.date}</div>
        <div class="cycle-ruler-sub">${fmtPrice(ctx.peakPrice)} · Yahoo Finance BTC-USD</div>
      </div>
      <div class="cycle-ruler-metric">
        <div class="cycle-ruler-label">${zh?'高点后完整日线':'completed days after high'}</div>
        <div class="cycle-ruler-value accent">${ctx.daysSincePeak}d</div>
        <div class="cycle-ruler-sub">${ctx.peak.date} → ${ctx.latest.date}</div>
      </div>
      <div class="cycle-ruler-metric">
        <div class="cycle-ruler-label">${zh?'距样本高点':'from sample high'}</div>
        <div class="cycle-ruler-value negative">${drawdownText}</div>
        <div class="cycle-ruler-sub">${zh?'最新收盘相对样本期最高价':'latest close vs sample-period high'}</div>
      </div>
    </div>
    <div class="cycle-track" role="img" aria-label="${zh?`当前为高点后第 ${ctx.daysSincePeak} 天，历史三轮顶部到底部分别为 363、376、411 天`:`Current position is day ${ctx.daysSincePeak} after the sample high. Prior peak-to-bottom samples were 363, 376, and 411 days`}">
      <span class="cycle-track-line"></span>
      <span class="cycle-range" style="left:${rangeLeft}%;width:${Math.max(1,rangeRight-rangeLeft)}%"></span>
      ${markerHtml}
      <span class="cycle-now" style="left:${pct(ctx.daysSincePeak)}%"></span>
      <span class="cycle-scale-label" style="left:${pct(ctx.daysSincePeak)}%">${zh?'当前':'NOW'} ${ctx.daysSincePeak}d</span>
      <span class="cycle-range-label">${zh?'历史样本':'HISTORY'} ${markerDays}d</span>
    </div>
    <div class="cycle-ruler-insight"><strong>${insight}</strong><span>${zh?'仅为历史时间距离，不是见底倒计时':'Historical distance only, not a countdown to a bottom'}</span></div>
    <div class="cycle-benchmarks">
      <div class="cycle-benchmark"><span class="cycle-benchmark-label">${zh?'三轮顶部到底部':'Three peak-to-bottom samples'}</span><span class="cycle-benchmark-value">363 / 376 / 411d</span></div>
      <div class="cycle-benchmark"><span class="cycle-benchmark-label">${zh?'三轮低点到高点':'Three low-to-peak samples'}</span><span class="cycle-benchmark-value">${bullDays.join(' / ')}d</span></div>
      <div class="cycle-benchmark"><span class="cycle-benchmark-label">${zh?'三轮减半到高点':'Three halving-to-peak samples'}</span><span class="cycle-benchmark-value">${halvingDays.join(' / ')}d</span></div>
      <div class="cycle-benchmark"><span class="cycle-benchmark-label">${zh?'历史顶部到底部观察区间':'Historical peak-to-bottom range'}</span><span class="cycle-benchmark-value">${bearMin}-${bearMax}d</span></div>
    </div>
    <p class="cycle-ruler-note">${zh?'历史周期日期来自 Bitstamp BTC/USD UTC 日线研究；当前高点、收盘价和回撤来自 Yahoo Finance BTC-USD UTC 日线。三个样本只用于历史比较，不是见底日期或逃顶日期预测。若样本期出现更高价格，当前计时起点会自动更新。':'Historical cycle dates use the Bitstamp BTC/USD UTC daily study. The current sample high, close, and drawdown use Yahoo Finance BTC-USD UTC daily data. Three samples are context only, not bottom or top dates. A new sample high automatically resets the current clock.'}</p>`;
}

// ── I18N ──
const T = {
en:{
  live:'LIVE',fromATH:'FROM ATH',nextHalv:'NEXT HALVING',
  tagline:'/ bitcoin historical event lookup',
  asset:'Asset',
  heroTag:'FACTS ONLY · YOU DECIDE',
  heroH1:'When Bitcoin drops <span class="hl">10%</span> in a day -<br>what happened next?',
  heroSub:'Real data 2017-2026. No predictions. Look up the pattern, decide for yourself.',
  heroNote:'Yahoo Finance BTC-USD · UTC daily candles · data updates daily',
  dailyScanTitle:'Latest completed daily signals',
  dailyScanCopy:'Scans the last completed UTC daily candle. It identifies moves that already happened, without predicting what comes next.',
  saveQuery:'Save this watch condition',
  saveQueryNote:'Save up to 5 on this device',
  backtestEntry:'Conditional buy backtest',
  backtestEntryCopy:'Compare conditional buying with weekly DCA using historical data. Open it only when needed.',
  backtestOpen:'Open tool',
  qTitle:'QUERY HISTORICAL EVENTS',
  ql1:'When selected asset',ql2:'in a single day:',
  oDrop:'closes DOWN at least',oRise:'closes UP at least',oRange:'swings (High→Low) at least',
  oWick:'wick depth (Close−Low) at least',
  warn:'⚠ Statistics use 2017+ data only. Pre-2017 BTC was illiquid - including it would distort results.',
  qBtn:'Look up historical pattern →',
  sCount:'Occurrences',sSince:'since Jan 2017',sAvg:'Avg magnitude',sLast:'Most recent',
  p1:'Next-day positive share',p7:'7-day positive share',p30:'30-day positive share',
  spikeTitle:'INTRADAY LOW RECOVERY',
  spikeIf:"Low to close rebound at least 1%:",spikeOf:'(historical share, not a buy guarantee)',
  tblTitle:'Complete Historical Record',showMore:'Load 10 more',
  genRpt:'Generate Report Card',
  dsTitle:'📚 Data Sources',
  ds1:'Daily OHLC',ds2:'Volume',ds3:'Range',ds3note:'Pre-2017 excluded',ds4:'Live Price',
  stHealth:'Data health',stAsset:'Asset',stThrough:'Dataset through',stChecked:'Last checked',stSource:'Source',
  methodLink:'View data sources and calculation methods →',methodFoot:'Data & methodology',
  disc:'Historical data only. Not investment advice. Past patterns ≠ future results. Crypto is highly volatile. Always make your own decisions.',
  mshare:'X Share',mdl:'Download PNG',mclose:'Close',mcopy:'📋 Copy Link',
  mnote:'Download PNG to save · Screenshot to share',
  foot:'Facts only · You decide · Yahoo Finance OHLCV',

  cbTitle:'CONDITIONAL BUY BACKTEST',
  cbSub:'Choose a start date, drop threshold, and buy amount. Historical backtest only, not a trading signal.',
  cbFrom:'From', cbWhen:'when selected asset closes down more than', cbBuy:'buy', cbRun:'Run backtest', cbReport:'Generate Backtest Report', cbCustomPh:'Custom %', cbCustomHint:'Choose a fixed drop, or enter your own drop %', cbTiered:'Advanced: tiered buying', cbTierIf:'Drop >', cbTierBuy:'buy $', cbTierHint:'Tiered mode uses the previous close as the reference price. If the intraday low reaches -12%, all crossed tiers trigger, buying at each tier price. Default example: 3%/$100 + 5%/$200 + 8%/$400 + 12%/$800 = <strong>$1,500/day max</strong> - a 2x doubling ladder. Adjust freely.', cbEvery7:'Every 7 days',
  cbStratTitle:'YOUR STRATEGY · CONDITIONAL BUYING',
  cbTriggers:'Times triggered', cbFreq:'Avg frequency',
  cbInvested:'Total invested', cbBTC:'Asset accumulated',
  cbAvgBuy:'Avg buy price', cbValue:'Current value', cbProfit:'Profit', cbROI:'Return on invested capital',
  cbDCATitle:'VS WEEKLY DCA · SAME AMOUNT/WEEK',
  cbDCAWeeks:'Total weeks', cbDCAFreq:'Frequency',
  cbDCAInv:'Total invested', cbDCABTC:'Asset accumulated',
  cbDCAAvg:'Avg buy price', cbDCAVal:'Current value', cbDCAProfit:'Profit', cbDCARoi:'Return on invested capital',
  cbNoteTitle:'Important:', cbNote:'Return % is calculated against each strategy’s actual invested capital. Conditional buying may deploy less capital than weekly DCA. Past results do not predict future returns.',
  thDrop:['Date','Close','Drop %','Day Low','Low→Close','Next Day','7d','30d'],
  thRise:['Date','Close','Rise %','Day Low','Low→Close','Next Day','7d','30d'],
  thRange:['Date','High','Low','Swing','Close %','Low→Close','Next Day','7d'],
  thWick:['Date','Day Low','Close','Wick Depth','Swing','Close %','Next Day','7d','30d'],
  interp:{
    wick:(t,n,u1,a1,u7,a7)=>`${activeCoin} wick depth >${t}% has happened <strong>${n} times</strong> in this dataset. Next day up: <strong>${u1}%</strong> (avg ${a1>=0?"+":""}${a1}%). After 7 days up: <strong>${u7}%</strong> (avg ${a7>=0?"+":""}${a7}%). <strong>Note:</strong> Buying at the exact intraday low is theoretically ideal but very difficult in practice. This data shows how often price recovered from its low - not that you can always catch it. <em>Past data is not a guarantee.</em>`,
    drop:(t,n,u1,a1,u30,a30,ltc,ltca)=>`${activeCoin} closed down at least ${t}% in a single day <strong>${n} times</strong> in this dataset. The historical next-day positive share was <strong>${u1}%</strong> (avg ${a1>=0?"+":""}${a1}%). The 30-day positive share was <strong>${u30}%</strong> (avg ${a30>=0?"+":""}${a30}%). On <strong>${ltc}%</strong> of those days, close finished at least 1% above the intraday low (avg rebound +${ltca}%). <em>Past data does not predict future results.</em>`,
    rise:(t,n,u1,a1,u30,a30,ltc,ltca)=>`${activeCoin} closed up at least ${t}% in a single day <strong>${n} times</strong> in this dataset. The historical next-day positive share was <strong>${u1}%</strong> (avg ${a1>=0?"+":""}${a1}%). The 30-day positive share was <strong>${u30}%</strong> (avg ${a30>=0?"+":""}${a30}%). <em>Past data does not predict future results.</em>`,
    range:(t,n,u1,a1,u30,a30,ltc,ltca)=>`${activeCoin} had an intraday range of at least ${t}% <strong>${n} times</strong> in this dataset. On <strong>${ltc}%</strong> of those days, close finished at least 1% above the intraday low (avg +${ltca}%). The historical next-day positive share was <strong>${u1}%</strong> (avg ${a1>=0?"+":""}${a1}%). <em>Past data does not predict future results.</em>`,
  },
  compTh:['Coin','Close','Pct','Low','Low→Close','Next Day','7d','30d'],
  snapBtn:'View 5-Coin Snapshot',
},
zh:{
  compTh:['币种','收盘价','涨跌幅','最低价','最低→收盘','次日','7日后','30日后'],
  snapBtn:'查看5币种对照快照',
  live:'实时',fromATH:'距历史高点',nextHalv:'下次减半',
  tagline:'/ 比特币历史行情查询',
  asset:'币种',
  heroTag:'只看数据 · 自己判断',
  heroH1:'比特币单日暴跌 <span class="hl">10%</span>，<br>历史上接下来会怎样？',
  heroSub:'基于2017年至今真实数据。无预测，无建议。查规律，自己判断。',
  heroNote:'数据来源：Yahoo Finance BTC-USD · UTC日线 · 每日自动更新',
  dailyScanTitle:'今日已收盘信号',
  dailyScanCopy:'扫描最后一个完整 UTC 日线。只识别已发生的异常波动，不预测下一步。',
  saveQuery:'保存这个关注条件',
  saveQueryNote:'最多保存5个，只保存在这台设备',
  backtestEntry:'条件买入回测',
  backtestEntryCopy:'使用历史数据比较条件买入与每周定投，需要时再打开。',
  backtestOpen:'打开工具',
  qTitle:'历史事件查询',
  ql1:'当所选币种',ql2:'时，历史上发生了什么？',
  oDrop:'单日收盘下跌至少',oRise:'单日收盘上涨至少',oRange:'单日振幅（最高→最低）至少',
  oWick:'单日插针深度（收盘−最低）至少',
  warn:'⚠ 统计仅使用2017年后数据。2017年前市场流动性极差，加入会导致统计失真。',
  qBtn:'查询历史规律 →',
  sCount:'历史发生次数',sSince:'2017年1月至今',sAvg:'平均幅度',sLast:'最近一次',
  p1:'次日历史收涨比例',p7:'7日后收涨比例',p30:'30日后收涨比例',
  spikeTitle:'当日低点回升统计',
  spikeIf:'收盘较最低价回升至少1%的比例:',spikeOf:'（历史比例，不代表可买在最低点）',
  tblTitle:'完整历史记录',showMore:'再显示10条',
  genRpt:'生成报告卡片',
  dsTitle:'📚 数据来源',
  ds1:'每日OHLC',ds2:'成交量',ds3:'数据范围',ds3note:'已排除2017年前',ds4:'实时价格',
  stHealth:'数据健康',stAsset:'当前币种',stThrough:'数据截止',stChecked:'上次检查',stSource:'数据源',
  methodLink:'查看数据来源与计算方法 →',methodFoot:'数据与方法',
  disc:'仅供历史数据参考，不构成投资建议。历史规律不代表未来走势。加密货币风险极高。请自行判断，谨慎决策。',
  mshare:'X 分享',mdl:'下载 PNG',mclose:'关闭',mcopy:'📋 复制链接',
  mnote:'点击下载PNG保存报告 · 截图可直接分享',
  foot:'只看数据 · 自己判断 · 数据：Yahoo Finance OHLCV',

  cbTitle:'条件买入历史回测',
  cbSub:'选择开始日期、下跌阈值和每次买入金额。这里只是历史回测，不是交易信号。',
  cbFrom:'从', cbWhen:'当所选币种单日收盘下跌超过', cbBuy:'时买入', cbRun:'运行回测', cbReport:'生成回测报告', cbCustomPh:'自定义%', cbCustomHint:'可选固定跌幅，或输入自定义跌幅', cbTiered:'高级：分层买入', cbTierIf:'跌超', cbTierBuy:'买入 $', cbTierHint:'分层模式以前一日收盘价为基准。若当日最低价触及 -12%，会触发所有穿过的层，并按各层价格买入。默认翻倍模式：3%/$100 + 5%/$200 + 8%/$400 + 12%/$800 = 最多 $1,500/天。可自由调整。', cbEvery7:'每7天一次',
  cbStratTitle:'你的策略 · 条件买入',
  cbTriggers:'历史触发次数', cbFreq:'平均触发频率',
  cbInvested:'总投入', cbBTC:'累计币数',
  cbAvgBuy:'平均买入价', cbValue:'当前价值', cbProfit:'盈利金额', cbROI:'投入收益率',
  cbDCATitle:'对比 · 每周投入相同金额',
  cbDCAWeeks:'总周数', cbDCAFreq:'频率',
  cbDCAInv:'总投入', cbDCABTC:'累计币数',
  cbDCAAvg:'平均买入价', cbDCAVal:'当前价值', cbDCAProfit:'盈利金额', cbDCARoi:'投入收益率',
  cbNoteTitle:'重要说明:', cbNote:'回报率基于各自的实际投入金额计算。条件买入通常投入次数更少，绝对收益与每周定投不同。历史数据不代表未来。',
  thDrop:['日期','收盘价','跌幅','当日最低','最低→收盘','次日','7日后','30日后'],
  thRise:['日期','收盘价','涨幅','当日最低','最低→收盘','次日','7日后','30日后'],
  thRange:['日期','最高','最低','振幅','收盘%','最低→收盘','次日','7日后'],
  thWick:['日期','当日最低','收盘价','插针深度','振幅','当日涨跌','次日','7日后','30日后'],
  interp:{
    wick:(t,n,u1,a1,u7,a7)=>`${activeCoin} 插针深度至少${t}%在当前数据集中共发生了<strong>${n}次</strong>。样本内次日收涨比例为<strong>${u1}%</strong>（均值${a1>0?"+":""}${a1}%）；7日后收涨比例为<strong>${u7}%</strong>（均值${a7>0?"+":""}${a7}%）。<strong>重要说明：</strong>在最低点买入在理论上最优，但实际操作中极难精确执行。此数据描述历史结果，并不代表你能准确买在最低点。<em>历史数据，不代表未来。</em>`,
    drop:(t,n,u1,a1,u30,a30,ltc,ltca)=>`当前数据集中，${activeCoin} 单日收盘跌幅至少${t}%共发生了<strong>${n}次</strong>。样本内次日收涨比例为<strong>${u1}%</strong>（均值${a1>0?"+":""}${a1}%）；30日后收涨比例为<strong>${u30}%</strong>（均值${a30>0?"+":""}${a30}%）。其中<strong>${ltc}%</strong>的日期收盘较当日最低价回升至少1%（平均回升+${ltca}%）。<em>历史数据，不代表未来。</em>`,
    rise:(t,n,u1,a1,u30,a30,ltc,ltca)=>`当前数据集中，${activeCoin} 单日收盘涨幅至少${t}%共发生了<strong>${n}次</strong>。样本内次日收涨比例为<strong>${u1}%</strong>（均值${a1>0?"+":""}${a1}%）；30日后收涨比例为<strong>${u30}%</strong>（均值${a30>0?"+":""}${a30}%）。<em>历史数据，不代表未来。</em>`,
    range:(t,n,u1,a1,u30,a30,ltc,ltca)=>`当前数据集中，${activeCoin} 单日振幅至少${t}%共发生了<strong>${n}次</strong>。其中<strong>${ltc}%</strong>的日期收盘较当日最低价回升至少1%（平均回升+${ltca}%）。样本内次日收涨比例为<strong>${u1}%</strong>（均值${a1>0?"+":""}${a1}%）。<em>历史数据，不代表未来。</em>`,
  }
}};

const savedLang = localStorage.getItem('btcPatternLang');
let lang=savedLang === 'en' ? 'en' : 'zh', qtype='drop', thresh=8;
const requestedTypeCandidate = PAGE_PARAMS.get('type') || PAGE_PRESET.type;
const requestedKind = PAGE_PARAMS.get('kind') || (PAGE_PRESET.type ? 'event' : null);
const requestedQueryType = requestedKind === 'event' && ['drop','rise','range','wick'].includes(requestedTypeCandidate)
  ? requestedTypeCandidate : null;
const requestedQueryThreshold = Number(PAGE_PARAMS.get('threshold') || PAGE_PRESET.threshold);
const hasRequestedQuery = requestedQueryType && [3,5,8,10,15,20,30].includes(requestedQueryThreshold);
const requestedMode = PAGE_PARAMS.get('kind') || PAGE_PRESET.mode || (PAGE_PRESET.type ? 'event' : null);
const requestedBacktestStart = PAGE_PARAMS.get('start') || PAGE_PRESET.start || '';
const requestedBacktestThreshold = Number(PAGE_PARAMS.get('drop') || PAGE_PRESET.drop);
const requestedBacktestAmount = Number(PAGE_PARAMS.get('amount') || PAGE_PRESET.amount);
const SAVED_QUERY_KEY='btcPatternSavedQueries';
function loadSavedQueries(){
  try{
    const parsed=JSON.parse(localStorage.getItem(SAVED_QUERY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item =>
      COIN_ORDER.includes(item?.coin) && ['drop','rise','range','wick'].includes(item?.type) && Number.isFinite(Number(item?.threshold))
    ).slice(0,5) : [];
  }catch(e){ return []; }
}
let SAVED_QUERIES=loadSavedQueries();
let allRows=[], shown=20;
let shareText='';
const SITE_URL='https://www.mybtcbox.com';
const OG_VERSION='20260514';
function shareUrl(kind='event',ref='x'){
  const params=new URLSearchParams({ref,asset:activeCoin.toLowerCase(),kind,v:OG_VERSION});
  if(kind === 'event'){
    params.set('type',qtype);
    params.set('threshold',String(thresh));
  }
  if(kind === 'backtest'){
    const start=document.getElementById('cb-start')?.value;
    const amount=document.getElementById('cb-amount')?.value;
    if(start) params.set('start',start);
    params.set('drop',String(cbThresh));
    if(amount) params.set('amount',amount);
  }
  return `${SITE_URL}/?${params.toString()}`;
}
const ATH=124723, NEXT_HALF=new Date('2028-04-17').getTime();
const COINGECKO_IDS={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',DOGE:'dogecoin',BNB:'binancecoin'};
let ACTIVE_ATH=BTC_DATA._ath || RAW_COINS.BTC?._ath || ATH;
let MARKET_PRICES = {};
let MARKET_SENTIMENT = { fundingRate:null, lsRatio:null };
let MARKET_LIVE_STATE = { prices:'loading', sentiment:'loading', lastUpdated:null };
let liveRefreshSeq = 0;

function signedPct(v, digits=2){
  return v == null || !Number.isFinite(v) ? '-' : (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}
function pctClass(v){ return v == null ? '' : (v >= 0 ? 'up' : 'dn'); }
function ensureCoinData(coin){
  return loadCoinData(coin).then(data => {
    if(!COIN_DATA[coin]) COIN_DATA[coin] = buildBtcData(data);
    return COIN_DATA[coin];
  });
}
function ensureAllCoinData(){
  return Promise.all(COIN_ORDER.map(ensureCoinData));
}
function latestSignalForData(data){
  const daily = data?.daily || [];
  const last = daily[daily.length - 1];
  if(!last) return null;
  const statsFor = (type, th) => data?.pre?.[type]?.[String(th)] || null;
  let kind = 'none', threshold = null, labelEn = 'No extreme daily signal', labelZh = '未触发极端日线信号', stats = null;
  const closeMove = last.pct_raw ?? last.pct;
  if(closeMove != null && closeMove <= -8){ kind='drop'; threshold=8; labelEn='Close dropped at least 8%'; labelZh='收盘下跌至少 8%'; stats=statsFor('drop', 8); }
  else if(closeMove != null && closeMove <= -5){ kind='drop'; threshold=5; labelEn='Close dropped at least 5%'; labelZh='收盘下跌至少 5%'; stats=statsFor('drop', 5); }
  else if(closeMove != null && closeMove <= -3){ kind='drop'; threshold=3; labelEn='Close dropped at least 3%'; labelZh='收盘下跌至少 3%'; stats=statsFor('drop', 3); }
  else if(closeMove != null && closeMove >= 8){ kind='rise'; threshold=8; labelEn='Close rose at least 8%'; labelZh='收盘上涨至少 8%'; stats=statsFor('rise', 8); }
  else if(closeMove != null && closeMove >= 5){ kind='rise'; threshold=5; labelEn='Close rose at least 5%'; labelZh='收盘上涨至少 5%'; stats=statsFor('rise', 5); }
  else if(closeMove != null && closeMove >= 3){ kind='rise'; threshold=3; labelEn='Close rose at least 3%'; labelZh='收盘上涨至少 3%'; stats=statsFor('rise', 3); }
  else if(last.range_pct != null && last.range_pct >= 8){ kind='range'; threshold=8; labelEn='Intraday swing over 8%'; labelZh='日内振幅超过 8%'; stats=statsFor('range', 8); }
  else if(last.low_to_close != null && last.low_to_close >= 5){ kind='wick'; threshold=5; labelEn='Low-to-close rebound over 5%'; labelZh='最低到收盘回升超过 5%'; stats=data?.wick?.pre?.[String(5)] || null; }
  return { date:last.date, day:last, kind, threshold, labelEn, labelZh, stats };
}
function signalMove(signal){
  if(!signal?.day) return null;
  if(signal.kind==='range') return signal.day.range_pct;
  if(signal.kind==='wick') return signal.day.low_to_close;
  return signal.day.pct;
}
function renderDailySignals(){
  const host=document.getElementById('daily-signal-list');
  const countEl=document.getElementById('daily-scan-count');
  if(!host || !countEl) return;
  const rows=COIN_ORDER.map(code => ({code, signal:latestSignalForData(COIN_DATA[code])}));
  const triggered=rows.filter(row => row.signal && row.signal.kind!=='none').length;
  countEl.textContent=lang==='zh' ? `${triggered}/5 个币种触发` : `${triggered}/5 assets triggered`;
  host.innerHTML=rows.map(({code,signal}) => {
    if(!signal){
      return `<div class="daily-signal"><div class="daily-signal-top"><span class="daily-signal-coin">${code}</span></div><div class="daily-signal-label">${lang==='zh'?'数据加载中':'Loading data'}</div></div>`;
    }
    const isTriggered=signal.kind!=='none';
    const move=signalMove(signal);
    const moveText=signedPct(move);
    const label=isTriggered
      ? (lang==='zh' ? signal.labelZh : signal.labelEn)
      : (lang==='zh'
        ? `常规波动，日内振幅 ${signal.day.range_pct == null ? '-' : signal.day.range_pct.toFixed(2)+'%'}`
        : `Routine move, daily range ${signal.day.range_pct == null ? '-' : signal.day.range_pct.toFixed(2)+'%'}`);
    const sample=isTriggered && signal.stats?.count
      ? (lang==='zh' ? `查看 ${signal.stats.count} 个历史样本` : `Open ${signal.stats.count} historical samples`)
      : '';
    const content=`<div class="daily-signal-top"><span class="daily-signal-coin">${code}</span><span class="daily-signal-date">${signal.date}</span></div>
      <div class="daily-signal-move ${pctClass(move)}">${moveText}</div>
      <div class="daily-signal-label">${label}</div>
      ${sample ? `<div class="daily-signal-action">${sample}</div>` : ''}`;
    return isTriggered
      ? `<button class="daily-signal triggered" type="button" onclick="openDailySignal('${code}','${signal.kind}',${signal.threshold})">${content}</button>`
      : `<div class="daily-signal">${content}</div>`;
  }).join('');
}
async function openDailySignal(coin,type,threshold){
  await selectCoin(coin);
  qtype=type;
  document.getElementById('qtype').value=type;
  onType();
  setT(Number(threshold));
  run();
  document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function savedQueryLabel(item){
  const labels=lang==='zh'
    ? {drop:'收盘跌幅至少',rise:'收盘涨幅至少',range:'振幅至少',wick:'插针至少'}
    : {drop:'close down at least',rise:'close up at least',range:'range at least',wick:'wick at least'};
  return lang==='zh'
    ? `${item.coin} ${labels[item.type]} ${item.threshold}%`
    : `${item.coin} ${labels[item.type]} ${item.threshold}%`;
}
function persistSavedQueries(){
  localStorage.setItem(SAVED_QUERY_KEY,JSON.stringify(SAVED_QUERIES));
}
function renderSavedQueries(){
  const host=document.getElementById('saved-queries');
  if(!host) return;
  host.innerHTML=SAVED_QUERIES.map((item,index) => {
    const label=savedQueryLabel(item);
    const removeLabel=lang==='zh' ? `删除 ${label}` : `Remove ${label}`;
    return `<span class="saved-query"><button class="saved-query-open" type="button" onclick="applySavedQuery(${index})">${label}</button><button class="saved-query-remove" type="button" aria-label="${removeLabel}" onclick="removeSavedQuery(${index})">×</button></span>`;
  }).join('');
}
function saveCurrentQuery(){
  const next={coin:activeCoin,type:qtype,threshold:Number(thresh)};
  const exists=SAVED_QUERIES.some(item => item.coin===next.coin && item.type===next.type && Number(item.threshold)===next.threshold);
  if(exists){
    toast(lang==='zh' ? '这个条件已经保存' : 'This condition is already saved');
    return;
  }
  SAVED_QUERIES=[next,...SAVED_QUERIES].slice(0,5);
  persistSavedQueries();
  renderSavedQueries();
  renderDailyObservation();
  toast(lang==='zh' ? '已保存到这台设备' : 'Saved on this device');
}
async function applySavedQuery(index){
  const item=SAVED_QUERIES[index];
  if(!item) return;
  await selectCoin(item.coin);
  qtype=item.type;
  document.getElementById('qtype').value=item.type;
  onType();
  setT(Number(item.threshold));
  run();
  document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function removeSavedQuery(index){
  if(!SAVED_QUERIES[index]) return;
  SAVED_QUERIES.splice(index,1);
  persistSavedQueries();
  renderSavedQueries();
  renderDailyObservation();
}
function renderTopTicker(){
  const data = COIN_DATA[activeCoin] || BTC_DATA;
  const latest = data?.daily?.[data.daily.length - 1] || null;
  const live = MARKET_PRICES[activeCoin] || {};
  const price = live.price || latest?.close || null;
  const change24h = Number.isFinite(live.change24h) ? live.change24h : latest?.pct;
  const ath = data?._ath || RAW_COINS[activeCoin]?._ath || ACTIVE_ATH;
  const fa = price && ath ? ((price - ath) / ath * 100) : null;
  const sym = document.getElementById('ticker-symbol');
  if(sym) sym.textContent = activeCoin;
  const tp = document.getElementById('tp');
  if(tp) tp.textContent = fmtPrice(price);
  const ce = document.getElementById('tc');
  if(ce){
    ce.textContent = signedPct(change24h);
    ce.className = 'mono ' + (change24h >= 0 ? 'up' : 'dn');
  }
  const ta = document.getElementById('ta');
  if(ta){
    ta.textContent = signedPct(fa);
    ta.className = 'mono ' + (fa >= 0 ? 'up' : 'dn');
  }
  var now = new Date();
  const tt = document.getElementById('tt');
  if(tt){
    tt.textContent = lang==='zh'
      ? now.toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Shanghai'})+' 北京时间'
      : now.toUTCString().slice(17,25)+' UTC';
  }
}
function renderMarketDashboard(){
  renderTopTicker();
  renderDailySignals();
}
async function updateMarketDashboard(){
  const seq = ++liveRefreshSeq;
  try{
    const ids = COIN_ORDER.map(c => COINGECKO_IDS[c]).join(',');
    const d = await fetchProxyJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if(seq !== liveRefreshSeq) return;
    COIN_ORDER.forEach(code => {
      const item = d[COINGECKO_IDS[code]];
      if(item){
        MARKET_PRICES[code] = { price:item.usd, change24h:item.usd_24h_change };
      }
    });
    MARKET_LIVE_STATE.prices = 'live';
    MARKET_LIVE_STATE.lastUpdated = new Date().toISOString();
    renderTopTicker();
  }catch(e){
    MARKET_LIVE_STATE.prices = 'unavailable';
  }
  try{ await ensureAllCoinData(); }catch(e){}
  if(seq !== liveRefreshSeq) return;
  renderMarketDashboard();
}
// ── CONDITIONAL BUY BACKTEST ──
let cbThresh = 5;

let DAILY_SERIES = [];
let LATEST_DAILY = null;

function buildDailySeries(){
  const rows = (BTC_DATA.daily || [])
    .filter(d => d && d.date && d.close)
    .map(d => ({ date:d.date, close:d.close, low:d.low, high:d.high, pct:d.pct }));
  rows.forEach((d,i) => { d.prevClose = i > 0 ? rows[i-1].close : null; });
  return rows;
}

function refreshDailySeries(){
  DAILY_SERIES = buildDailySeries();
  LATEST_DAILY = DAILY_SERIES[DAILY_SERIES.length - 1] || null;
}
refreshDailySeries();

function loadCoinData(coin){
  if(RAW_COINS[coin]) return Promise.resolve(RAW_COINS[coin]);
  if(!COIN_ORDER.includes(coin)) return Promise.reject(new Error('Unsupported coin: ' + coin));
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-coin="${coin}"]`);
    if(existing){
      existing.addEventListener('load', () => resolve(window[`${coin}_DAILY_DATA`]));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = `data/${coin.toLowerCase()}.daily.js`;
    script.dataset.coin = coin;
    script.onload = () => {
      const data = window[`${coin}_DAILY_DATA`];
      if(!data?.daily?.length){
        reject(new Error(`${coin} data loaded but was empty.`));
        return;
      }
      RAW_COINS[coin] = data;
      data._ath = data.daily.reduce((max, d) => Math.max(max, d.high || d.close || 0), 0);
      resolve(data);
    };
    script.onerror = () => reject(new Error(`Failed to load ${coin} data.`));
    document.head.appendChild(script);
  });
}

async function selectCoin(coin){
  if(!COIN_ORDER.includes(coin)) return;
  const shouldRefreshResults=document.getElementById('results')?.classList.contains('show');
  if(!RAW_COINS[coin]){
    toast(lang==='zh' ? '正在加载 ' + coin + ' 数据...' : 'Loading ' + coin + ' data...');
  }
  try{
    const data = await loadCoinData(coin);
    // Build COIN_DATA if not yet built for this coin
    if (!COIN_DATA[coin]) {
      COIN_DATA[coin] = buildBtcData(data);
    }
    activeCoin = coin;
    localStorage.setItem('btcPatternCoin', coin);
    BTC_DAILY_RAW = data;
    BTC_DATA = buildBtcData(BTC_DAILY_RAW);
    refreshDailySeries();
    ACTIVE_ATH = data._ath || ATH;
    document.getElementById('ticker-symbol').textContent = coin;
    const halvingRow = document.getElementById('halving-row');
    if (halvingRow) halvingRow.style.display = coin === 'BTC' ? '' : 'none';
    // Update backtest date picker range to match coin's actual first/last dates
    const cbStart = document.getElementById('cb-start');
    if (cbStart && DAILY_SERIES.length) {
      cbStart.min = DAILY_SERIES[0].date;
      cbStart.max = LATEST_DAILY.date;
      if (cbStart.value < DAILY_SERIES[0].date) cbStart.value = DAILY_SERIES[0].date;
    }
    applyLang();
    onType();
    if(shouldRefreshResults) run();
    updateCB();
    renderMarketDashboard();
    updatePrice();
  }catch(err){
    toast(lang==='zh' ? `无法加载 ${coin} 数据` : `Could not load ${coin} data`);
    console.error(err);
  }
}

function nearestDaily(dateStr){
  for(const d of DAILY_SERIES){ if(d.date >= dateStr) return d; }
  return null;
}
function addDays(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function calcBuyStats(rows, amount){
  const invested = rows.length * amount;
  const btc = rows.reduce((sum,d) => sum + amount / d.close, 0);
  const currentValue = btc * LATEST_DAILY.close;
  return { count:rows.length, invested, btc, currentValue, avgBuy:btc ? invested / btc : 0, roi:invested ? (currentValue / invested - 1) * 100 : 0 };
}
function buildWeeklyRows(startDate){
  const rows = [];
  let d = startDate;
  while(d <= LATEST_DAILY.date){
    const day = nearestDaily(d);
    if(day && (!rows.length || rows[rows.length - 1].date !== day.date)) rows.push(day);
    d = addDays(d, 7);
  }
  return rows;
}
function setCBThresh(t) {
  if(!Number.isFinite(t) || t <= 0) return;
  cbThresh = t;
  document.querySelectorAll('#cb-thresh-btns .tb').forEach(b => {
    b.classList.toggle('on', parseFloat(b.textContent) === t);
  });
  const custom = document.getElementById('cb-custom-thresh');
  if(custom && ![3,5,8,10,15].includes(t)) custom.value = t;
  updateCB();
}

function getTierRules(){
  const rules=[];
  for(let i=0;i<4;i++){
    const th=parseFloat(document.getElementById('tier-th-'+i)?.value);
    const amount=parseFloat(document.getElementById('tier-amt-'+i)?.value);
    if(Number.isFinite(th) && th>0 && Number.isFinite(amount) && amount>0){
      rules.push({threshold:th, amount});
    }
  }
  return rules.sort((a,b)=>a.threshold-b.threshold);
}
function calcTieredStats(rows, rules){
  let invested=0, btc=0, buys=0, days=0;
  for(const d of rows){
    if(!d.prevClose || !d.low) continue;
    let dayBuys=0;
    for(const r of rules){
      const triggerPrice = d.prevClose * (1 - r.threshold / 100);
      if(d.low <= triggerPrice){
        invested += r.amount;
        btc += r.amount / triggerPrice;
        buys++;
        dayBuys++;
      }
    }
    if(dayBuys>0) days++;
  }
  const currentValue = btc * LATEST_DAILY.close;
  return { count:days, buys, invested, btc, currentValue, avgBuy:btc ? invested / btc : 0, roi:invested ? (currentValue / invested - 1) * 100 : 0 };
}
function markWinner(leftId, rightId, leftValue, rightValue, lowerIsBetter=false){
  const left=document.getElementById(leftId), right=document.getElementById(rightId);
  if(!left || !right) return 'tie';
  left.classList.remove('metric-win','metric-lose','metric-neutral');
  right.classList.remove('metric-win','metric-lose','metric-neutral');
  if(!Number.isFinite(leftValue) || !Number.isFinite(rightValue) || Math.abs(leftValue-rightValue)<1e-9){
    left.classList.add('metric-neutral'); right.classList.add('metric-neutral'); return 'tie';
  }
  const leftWins = lowerIsBetter ? leftValue < rightValue : leftValue > rightValue;
  left.classList.add(leftWins?'metric-win':'metric-lose');
  right.classList.add(leftWins?'metric-lose':'metric-win');
  return leftWins ? 'left' : 'right';
}
function winnerLabel(result, zh){
  if(result==='left') return zh ? '条件买入' : 'conditional buying';
  if(result==='right') return zh ? '每周定投' : 'weekly DCA';
  return zh ? '两者接近' : 'roughly tied';
}
function updateCB() {
  const amount = Math.max(1, parseFloat(document.getElementById('cb-amount').value) || 100);
  const startInput = document.getElementById('cb-start');
  const startDate = startInput ? startInput.value : '2017-01-01';
  const startDay = nearestDaily(startDate) || DAILY_SERIES[0];
  if(!startDay || !LATEST_DAILY) return;

  // If no local data exists before coin's first date, it wasn't trading yet
  if (startDay.date !== startDate && startDate < startDay.date) {
    const zh = lang === 'zh';
    toast(zh
      ? `${activeCoin} 于 ${startDay.date} 才开始交易。回测已自动调整到该日期。`
      : `${activeCoin} started trading on ${startDay.date}. Backtest has been adjusted.`);
    if (document.getElementById('cb-start')) document.getElementById('cb-start').value = startDay.date;
  }

  const tiered = !!document.getElementById('cb-tiered')?.checked;
  const panel = document.getElementById('cb-tier-panel');
  if(panel) panel.classList.toggle('on', tiered);

  const eligible = DAILY_SERIES.filter(d => d.date >= startDay.date && d.pct != null);
  const triggerRows = eligible.filter(d => d.pct <= -cbThresh);
  const weeklyRows = buildWeeklyRows(startDay.date);
  const rules = getTierRules();
  const d = tiered ? calcTieredStats(eligible, rules) : calcBuyStats(triggerRows, amount);
  const dca = calcBuyStats(weeklyRows, amount);

  const years = Math.max(1/365, (new Date(LATEST_DAILY.date) - new Date(startDay.date)) / 31557600000);
  const fp = fmtDollars;
  const fprice = fmtPrice;
  const fcoin = v => v.toFixed(4) + ' ' + activeCoin;
  const froi = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  document.getElementById('cb-count').textContent = tiered ? `${d.count}d / ${d.buys}×` : d.count + '×';
  document.getElementById('cb-freq').textContent = ((tiered ? d.buys : d.count) / years).toFixed(1) + (lang==='zh'?' 次/年':' times/yr');
  document.getElementById('cb-invested').textContent = fp(d.invested);
  document.getElementById('cb-btc').textContent = fcoin(d.btc);
  document.getElementById('cb-avg').textContent = d.avgBuy ? fprice(d.avgBuy) : '-';
  document.getElementById('cb-value').textContent = fp(d.currentValue);
  const profitEl = document.getElementById('cb-profit');
  if(profitEl){ profitEl.textContent = d.invested ? fp(d.currentValue - d.invested) : '-'; profitEl.className = 'v ' + ((d.currentValue - d.invested) >= 0 ? 'up' : 'dn'); }
  const roiEl = document.getElementById('cb-roi');
  roiEl.textContent = d.invested ? froi(d.roi) : '-';
  roiEl.className = 'v ' + (d.roi >= 0 ? 'up' : 'dn');

  const wks = document.getElementById('cb-dca-weeks');
  if(wks) wks.innerHTML = dca.count + ' <span style="color:var(--ink3);font-size:11px">wks</span>';
  document.getElementById('cb-dca-inv').textContent = fp(dca.invested);
  document.getElementById('cb-dca-btc').textContent = fcoin(dca.btc);
  document.getElementById('cb-dca-avg').textContent = dca.avgBuy ? fprice(dca.avgBuy) : '-';
  document.getElementById('cb-dca-val').textContent = fp(dca.currentValue);
  const dcaProfitEl = document.getElementById('cb-dca-profit');
  if(dcaProfitEl){ dcaProfitEl.textContent = fp(dca.currentValue - dca.invested); dcaProfitEl.className = 'v ' + ((dca.currentValue - dca.invested) >= 0 ? 'up' : 'dn'); }
  const dcaROIEl = document.getElementById('cb-dca-roi');
  dcaROIEl.textContent = froi(dca.roi);
  dcaROIEl.className = 'v ' + (dca.roi >= 0 ? 'up' : 'dn');

  const btcWinner = markWinner('cb-btc','cb-dca-btc',d.btc,dca.btc);
  const valueWinner = markWinner('cb-value','cb-dca-val',d.currentValue,dca.currentValue);
  const profitWinner = markWinner('cb-profit','cb-dca-profit',d.currentValue-d.invested,dca.currentValue-dca.invested);
  const roiWinner = markWinner('cb-roi','cb-dca-roi',d.roi,dca.roi);
  markWinner('cb-avg','cb-dca-avg',d.avgBuy,dca.avgBuy,true);

  const zh = lang === 'zh';
  const diff = d.roi - dca.roi;
  const less = dca.invested - d.invested;
  const thresholdText = Number.isInteger(cbThresh) ? cbThresh : cbThresh.toFixed(1);
  const ruleText = tiered
    ? rules.map(r => `${r.threshold}%/${fp(r.amount)}`).join(' + ')
    : `${thresholdText}% / ${fp(amount)}`;
  const verdict = zh
    ? `从 ${startDay.date} 到 ${LATEST_DAILY.date}，${tiered?'分层规则':'条件规则'}（${ruleText}）共触发 <strong style="color:var(--accent)">${tiered ? `${d.count}天、${d.buys}笔` : `${d.count}次`}</strong>，总投入 ${fp(d.invested)}，盈利 ${fp(d.currentValue-d.invested)}，投入收益率 <strong style="color:${d.roi>=0?'var(--green)':'var(--red)'}">${d.invested?froi(d.roi):'-'}</strong>。` +
      `每周投入 ${fp(amount)}：投入 ${fp(dca.invested)}，盈利 ${fp(dca.currentValue-dca.invested)}，投入收益率 <strong>${froi(dca.roi)}</strong>。` +
      `<br><strong>对比结论：</strong>累计币数：<strong style="color:var(--green)">${winnerLabel(btcWinner,true)}</strong> 更高；盈利金额：<strong style="color:var(--green)">${winnerLabel(profitWinner,true)}</strong> 更高；投入收益率：<strong style="color:var(--green)">${winnerLabel(roiWinner,true)}</strong> 更高。` +
      `<br>条件买入比每周定投${less>=0?'少投入':'多投入'} <strong>${fp(Math.abs(less))}</strong>，回报率差值 <strong style="color:var(--accent)">${diff>=0?'+':''}${diff.toFixed(1)}个百分点</strong>。这是历史回测，不是买入建议。`
    : `From ${startDay.date} to ${LATEST_DAILY.date}, ${tiered?'tiered':'conditional'} rule (${ruleText}) triggered <strong style="color:var(--accent)">${tiered ? `${d.count} days / ${d.buys} buys` : `${d.count} buys`}</strong>, ${fp(d.invested)} invested, ${fp(d.currentValue-d.invested)} profit, return on invested capital <strong style="color:${d.roi>=0?'var(--green)':'var(--red)'}">${d.invested?froi(d.roi):'-'}</strong>. ` +
      `Weekly DCA with ${fp(amount)} invested ${fp(dca.invested)}, ${fp(dca.currentValue-dca.invested)} profit, return <strong>${froi(dca.roi)}</strong>.` +
      `<br><strong>Comparison:</strong> asset accumulated: <strong style="color:var(--green)">${winnerLabel(btcWinner,false)}</strong>; profit: <strong style="color:var(--green)">${winnerLabel(profitWinner,false)}</strong>; return on invested capital: <strong style="color:var(--green)">${winnerLabel(roiWinner,false)}</strong>.` +
      `<br>Conditional buying deployed <strong>${fp(Math.abs(less))} ${less>=0?'less':'more'}</strong> than weekly DCA. Return-rate difference: <strong style="color:var(--accent)">${diff>=0?'+':''}${diff.toFixed(1)}pp</strong>. Historical backtest only, not a buy signal.`;
  document.getElementById('cb-verdict').innerHTML = verdict;
}

// ── ENHANCED BACKTEST ANALYTICS ──

function buildWeeklyRowsRange(startDate, endDate) {
  const rows = [];
  let d = startDate;
  while (d <= endDate) {
    const day = nearestDaily(d);
    if (day && day.date <= endDate && (!rows.length || rows[rows.length - 1].date !== day.date)) rows.push(day);
    d = addDays(d, 7);
  }
  return rows;
}

function calcYearlyBacktest(startDate, tiered, rules, amount) {
  const years = {};
  const startYear = Math.max(parseInt(startDate.slice(0, 4)), 2017);
  const endYear = parseInt(LATEST_DAILY.date.slice(0, 4));
  if (startYear > endYear) return years;

  let cumStratBtc = 0, cumDcaBtc = 0, cumStratInv = 0, cumDcaInv = 0;

  for (let y = startYear; y <= endYear; y++) {
    const yearStart = `${y}-01-01`;
    const yearEnd = `${y}-12-31`;
    const segStart = y === startYear && startDate > yearStart ? startDate : yearStart;
    const segEnd = LATEST_DAILY.date < yearEnd ? LATEST_DAILY.date : yearEnd;
    if (segStart > segEnd) continue;
    const eligible = DAILY_SERIES.filter(d => d.date >= segStart && d.date <= segEnd && d.pct != null);
    if (!eligible.length) continue;

    const strat = tiered ? calcTieredStats(eligible, rules) : calcBuyStats(eligible.filter(d => d.pct <= -cbThresh), amount);
    const weeklyRows = buildWeeklyRowsRange(segStart, segEnd);
    const dca = calcBuyStats(weeklyRows, amount);

    cumStratBtc += strat.btc; cumDcaBtc += dca.btc;
    cumStratInv += strat.invested; cumDcaInv += dca.invested;
    const yep = eligible[eligible.length - 1].close;
    const cumStratVal = cumStratBtc * yep;
    const cumDcaVal = cumDcaBtc * yep;
    const stratROI = cumStratInv ? (cumStratVal / cumStratInv - 1) * 100 : 0;
    const dcaROI = cumDcaInv ? (cumDcaVal / cumDcaInv - 1) * 100 : 0;

    years[y] = {
      stratTriggers: strat.count, stratInvested: strat.invested, stratBtcAdded: strat.btc,
      cumStratBtc: cumStratBtc, cumStratInv: cumStratInv, cumStratVal,
      dcaInv: dca.invested, dcaBtcAdded: dca.btc,
      cumDcaBtc: cumDcaBtc, cumDcaInv: cumDcaInv, cumDcaVal,
      yep, winner: stratROI > dcaROI ? 'strat' : 'dca',
      stratROI,
      dcaROI,
    };
  }
  return years;
}

function calcMonthlyTriggers(startDate) {
  const months = Array.from({length:12}, (_,i) => ({month:i+1, triggers:0, totalInvested:0, drops:0}));
  const eligible = DAILY_SERIES.filter(d => d.date >= startDate && d.pct != null);
  for (const d of eligible) {
    if (d.pct <= -cbThresh) {
      const m = new Date(d.date + 'T00:00:00Z').getUTCMonth();
      months[m].triggers++;
      months[m].drops++;
    }
  }
  return months;
}

function calcStrategyMonthlyROI(startDate, tiered, rules, amount) {
  const months = Array.from({length:12}, (_,i) => ({month:i+1, stratReturns:[], dcaReturns:[]}));
  const startYear = Math.max(parseInt(startDate.slice(0, 4)), 2017);
  const endYear = parseInt(LATEST_DAILY.date.slice(0, 4));

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const ms = String(m).padStart(2,'0');
      const monthStart = `${y}-${ms}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${y}-${ms}-${lastDay}`;
      const segStart = y === startYear && startDate > monthStart ? startDate : monthStart;
      const segEnd = LATEST_DAILY.date < monthEnd ? LATEST_DAILY.date : monthEnd;
      if (segStart > segEnd) continue;
      const eligible = DAILY_SERIES.filter(d => d.date >= segStart && d.date <= segEnd && d.pct != null);
      if (!eligible.length) continue;
      const monthEndPrice = eligible[eligible.length - 1].close;
      const strat = tiered ? calcTieredStats(eligible, rules) : calcBuyStats(eligible.filter(d => d.pct <= -cbThresh), amount);
      const weeklyRows = buildWeeklyRowsRange(segStart, segEnd);
      const dca = calcBuyStats(weeklyRows, amount);
      const stratROI = strat.invested ? ((strat.btc * monthEndPrice) / strat.invested - 1) * 100 : 0;
      const dcaROI = dca.invested ? ((dca.btc * monthEndPrice) / dca.invested - 1) * 100 : 0;
      if (strat.invested) months[m-1].stratReturns.push(stratROI);
      if (dca.invested) months[m-1].dcaReturns.push(dcaROI);
    }
  }
  return months.map(mm => ({
    month: mm.month,
    stratAvg: mm.stratReturns.length ? mm.stratReturns.reduce((a,b)=>a+b,0) / mm.stratReturns.length : null,
    dcaAvg: mm.dcaReturns.length ? mm.dcaReturns.reduce((a,b)=>a+b,0) / mm.dcaReturns.length : null,
    stratCount: mm.stratReturns.length,
    dcaCount: mm.dcaReturns.length,
  }));
}

function calcBacktestDrawdowns(startDate, tiered, rules, amount) {
  const MONTHLY = 30;
  const sim = [];
  let stratBtc = 0, stratInv = 0, dcaBtc = 0, dcaInv = 0;
  let cursor = startDate;
  while (cursor <= LATEST_DAILY.date) {
    const segEnd = addDays(cursor, MONTHLY - 1);
    const eligible = DAILY_SERIES.filter(d => d.date >= cursor && d.date <= segEnd && d.pct != null);
    if (!eligible.length) { cursor = addDays(cursor, MONTHLY); continue; }
    const strat = tiered ? calcTieredStats(eligible, rules) : calcBuyStats(eligible.filter(d => d.pct <= -cbThresh), amount);
    const weeklyRows = buildWeeklyRowsRange(cursor, segEnd);
    const dca = calcBuyStats(weeklyRows, amount);
    stratBtc += strat.btc; stratInv += strat.invested;
    dcaBtc += dca.btc; dcaInv += dca.invested;
    const price = eligible[eligible.length - 1].close;
    sim.push({ date: segEnd, stratVal: stratBtc * price, stratInv, dcaVal: dcaBtc * price, dcaInv });
    cursor = addDays(segEnd, 1);
  }

  function findDrawdowns(values) {
    let peak = values[0], maxDd = 0, peakAfterDd = values[0], count20 = 0; const periods = [];
    for (const v of values) {
      if (v >= peak) { peak = v; peakAfterDd = v; }
      else {
        const dd = (v - peak) / peak * 100;
        if (dd < maxDd) { maxDd = dd; peakAfterDd = v; }
        if (dd <= -20) count20++;
      }
    }
    return { maxDd: maxDd ? Math.round(maxDd * 100) / 100 : 0, count20 };
  }

  return {
    strat: findDrawdowns(sim.map(s => s.stratVal)),
    dca: findDrawdowns(sim.map(s => s.dcaVal)),
  };
}

function setLang(l){
  lang=l;
  localStorage.setItem('btcPatternLang', l);
  document.querySelectorAll('.lbtn').forEach(b=>b.classList.toggle('on',
    (l==='en'&&b.textContent==='EN')||(l==='zh'&&b.textContent==='中文')));
  applyLang();
  if(document.getElementById('results').classList.contains('show')) run();
  updateCB();
}
function applyLang(){
  const L=T[lang];
  document.querySelectorAll('.lbtn').forEach(b=>b.classList.toggle('on',
    (lang==='en'&&b.textContent==='EN')||(lang==='zh'&&b.textContent==='中文')));
  document.querySelectorAll('[data-i]').forEach(el=>{
    const k=el.getAttribute('data-i');
    if(L[k]!==undefined){
      if(k==='heroH1') el.innerHTML=L[k];
      else el.textContent=L[k];
    }
  });
  const sel=document.getElementById('qtype');
  sel.options[0].text=L.oDrop; sel.options[1].text=L.oRise; sel.options[2].text=L.oRange;
  sel.options[3].text=L.oWick;
  const customThresh = document.getElementById('cb-custom-thresh');
  if(customThresh) customThresh.placeholder = L.cbCustomPh;
  const customHint = document.getElementById('cb-custom-hint');
  if(customHint) customHint.textContent = L.cbCustomHint;
  updateDynamicCopy();
  renderMarketDashboard();
  renderDailyObservation();
  renderCycleRuler();
  renderSavedQueries();
}

function updateDynamicCopy(){
  const start = DAILY_SERIES[0]?.date || '2017-01-01';
  const end = BTC_DATA.data_through || DAILY_SERIES[DAILY_SERIES.length - 1]?.date || '';
  const range = `${start} → ${end}`;
  const symbol = BTC_DAILY_RAW.symbol || `${activeCoin}-USD`;
  const coinName = COIN_DISPLAY[activeCoin]?.[lang] || activeCoin;
  const sourceLabel = `Yahoo Finance ${symbol}`;
  const quoteUrl = `https://finance.yahoo.com/quote/${symbol}`;
  const coinSelect = document.getElementById('coin-select');
  if(coinSelect) coinSelect.value = activeCoin;
  const heroTitle = document.getElementById('hero-title');
  if(heroTitle){
    const queryNames = lang === 'zh'
      ? {drop:'单日收盘下跌',rise:'单日收盘上涨',range:'单日振幅',wick:'插针深度'}
      : {drop:'daily close falls',rise:'daily close rises',range:'daily range reaches',wick:'wick depth reaches'};
    heroTitle.innerHTML = requestedMode === 'cycle'
      ? (lang === 'zh'
          ? 'BTC 当前周期走了多久？<br>与过去三轮相比在什么位置？'
          : 'How long has the current BTC cycle run,<br>compared with the last three cycles?')
      : requestedMode === 'backtest'
        ? (lang === 'zh'
            ? 'BTC 条件买入与每周定投，<br>历史结果有什么差别？'
            : 'BTC conditional buying versus weekly DCA,<br>what did history show?')
        : hasRequestedQuery
          ? (lang === 'zh'
          ? `${coinName} ${queryNames[requestedQueryType]}至少 <span class="hl">${requestedQueryThreshold}%</span>，<br>历史上后来怎样？`
          : `When ${coinName} ${queryNames[requestedQueryType]} <span class="hl">${requestedQueryThreshold}%</span>,<br>what happened next?`)
          : (lang === 'zh'
          ? `${coinName} 出现大幅波动时，<br>历史上接下来会怎样？`
          : `When ${coinName} moves sharply,<br>what happened next?`);
  }
  const heroNote = document.getElementById('hero-note');
  if(heroNote){
    heroNote.textContent = lang === 'zh'
      ? `数据来源：${sourceLabel} · UTC日线 · ${range} · 每日自动更新`
      : `${sourceLabel} · UTC daily candles · ${range} · updates daily`;
  }
  const dsRange = document.getElementById('ds-range');
  if(dsRange) dsRange.textContent = range;
  const manifestAsset = window.CRYPTO_DATA_HEALTH?.assets?.find(asset => asset.coin === activeCoin);
  const checkedAt = manifestAsset?.last_checked_at || BTC_DAILY_RAW.last_checked_at || BTC_DAILY_RAW.generated || '';
  const checkedText = checkedAt ? checkedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC') : '-';
  const stAsset = document.getElementById('st-asset');
  const stHealth = document.getElementById('st-health');
  const stThrough = document.getElementById('st-through');
  const stChecked = document.getElementById('st-checked');
  if(stAsset) stAsset.textContent = `${activeCoin} · ${symbol}`;
  if(stHealth){
    const todayUtc = new Date().toISOString().slice(0,10);
    const lag = Number.isFinite(manifestAsset?.lag_days)
      ? manifestAsset.lag_days
      : end ? Math.round((Date.parse(todayUtc+'T00:00:00Z') - Date.parse(end+'T00:00:00Z')) / 86400000) : null;
    const invalid = lag == null || lag < 0;
    const state = invalid || manifestAsset?.status === 'stale' || lag > 2 ? 'bad' : 'ok';
    stHealth.className = `status-val health-${state}`;
    stHealth.textContent = invalid
      ? (lang === 'zh' ? '数据日期异常' : 'Invalid data date')
        : state === 'ok'
          ? (lang === 'zh' ? `正常 · 延迟${lag}天` : `Healthy · ${lag} day lag`)
          : (lang === 'zh' ? `延迟 · ${lag}天未更新` : `Delayed · ${lag} days behind`);
  }
  if(stThrough) stThrough.textContent = end || '-';
  if(stChecked) stChecked.textContent = checkedText;
  const dsOhlcv = document.getElementById('ds-ohlcv');
  const dsVolume = document.getElementById('ds-volume');
  if(dsOhlcv) dsOhlcv.textContent = sourceLabel;
  if(dsVolume) dsVolume.textContent = sourceLabel;
  ['ds-yahoo-1','ds-yahoo-2'].forEach(id => {
    const a = document.getElementById(id);
    if(a) a.href = quoteUrl;
  });
  const startInput = document.getElementById('cb-start');
  if(startInput && end){
    startInput.min = start;
    startInput.max = end;
    if(startInput.value < start) startInput.value = start;
    if(startInput.value > end) startInput.value = end;
  }
}

function onType(){
  qtype=document.getElementById('qtype').value;
  if((qtype==='range'||qtype==='wick')&&thresh===3) setT(5);
  document.querySelectorAll('.tb').forEach(b=>{
    const v=parseInt(b.textContent);
    if(v===3) b.style.display=(qtype==='range'||qtype==='wick')?'none':'';
  });
}
function setT(t){
  thresh=t;
  document.querySelectorAll('.tb').forEach(b=>b.classList.toggle('on',parseInt(b.textContent)===t));
  // show early data warning for small thresholds
  document.getElementById('warn').style.display = (t<=5 || qtype==='range'&&t<=5) ? 'block':'none';
}

const fp=fmtPrice;
const pc=(p,s=true)=>p==null?'-':(s&&p>0?'+':'')+p.toFixed(2)+'%';
const badge=p=>{if(p==null)return'<span style="color:var(--ink3)">-</span>';
  return`<span class="bdg ${p>0?'up':'dn'}">${p>0?'+':''}${p.toFixed(2)}%</span>`;};
const colClass=p=>p>=60?'up':p>=50?'acc':'dn';
const barCol=p=>p>=60?'#10b981':p>=50?'#f97316':'#ef4444';

function setProbCell(puId,pbId,paId,pct,avg,validCount){
  const el=document.getElementById(puId);
  el.textContent=pct+'%'; el.className='ppct '+colClass(pct);
  const bar=document.getElementById(pbId);
  bar.dataset.targetWidth = pct;
  bar.style.width=pct+'%'; bar.style.background=barCol(pct);
  const dnPct = (100 - (pct || 0)).toFixed(1);
  const dnCount = validCount && pct != null ? Math.round(validCount * (100 - pct) / 100) : 0;
  const paEl = document.getElementById(paId);
  paEl.textContent = (lang==='zh'
    ? '均值 ' + (avg>0?'+':'') + avg + '% · 样本' + validCount + ' · ' + dnCount + '次↓'
    : 'avg ' + (avg>0?'+':'') + avg + '% · n=' + validCount + ' · ' + dnCount + ' dn');
}

function run(){
  const L=T[lang];
  let evts, stats;
  if(qtype==='drop'){ evts=BTC_DATA.drops.filter(e=>(e.pct_raw ?? e.pct)<=-thresh); stats=BTC_DATA.pre.drop[String(thresh)]; }
  else if(qtype==='rise'){ evts=BTC_DATA.rises.filter(e=>(e.pct_raw ?? e.pct)>=thresh); stats=BTC_DATA.pre.rise[String(thresh)]; }
  else if(qtype==='wick'){ evts=BTC_DATA.wick.events.filter(e=>(e.wick_depth_raw ?? e.wick_depth)>=thresh); stats=BTC_DATA.wick.pre[String(thresh)]; }
  else { evts=BTC_DATA.intraday.filter(e=>(e.range_pct_raw ?? e.range_pct)>=thresh); stats=BTC_DATA.pre.range[String(thresh)]; }

  if(!stats||!evts.length){ toast(lang==='zh'?'暂无符合条件的数据':'No data for this threshold'); return; }

  allRows=evts; shown=10;

  // stat3
  document.getElementById('sn').textContent=stats.count;
  const avgMag=evts.reduce((s,e)=>s+Math.abs(qtype==='range'?e.range_pct:qtype==='wick'?e.wick_depth:e.pct),0)/evts.length;
  document.getElementById('savg').textContent=avgMag.toFixed(1)+'%';
  document.getElementById('savgsub').textContent=lang==='zh'?'平均幅度':'avg magnitude';
  const last=evts[0];
  document.getElementById('sldate').textContent=last.date;
  document.getElementById('slpct').textContent=qtype==='range'?pc(last.range_pct):qtype==='wick'?pc(last.wick_depth)+'wick':pc(last.pct);

  // prob3
  setProbCell('pu1','pb1','pa1',stats.up1_pct,stats.up1_avg, stats.n1);
  setProbCell('pu7','pb7','pa7',stats.up7_pct,stats.up7_avg, stats.n7);
  setProbCell('pu30','pb30','pa30',stats.up30_pct,stats.up30_avg, stats.n30);

  // spike box - 只在下跌和振幅查询时显示，上涨查询无意义
  const sb=document.getElementById('spikebox');
  if(stats.ltc_1_pct!=null && qtype !== 'rise' && qtype !== 'wick'){
    sb.style.display='flex';
    document.getElementById('spike-pct').textContent=stats.ltc_1_pct+'%';
    document.getElementById('spike-sub').textContent=(lang==='zh'?'当日最低→收盘平均反弹：':'avg intraday rebound: ')+'+'+stats.ltc_avg+'%';
  } else { sb.style.display='none'; }

  // interp
  const ltc=stats.ltc_1_pct??'N/A', ltca=stats.ltc_avg??0;
  if(qtype==='wick'){
    document.getElementById('interp').innerHTML=L.interp.wick(thresh,stats.count,stats.up1_pct,stats.up1_avg,stats.up7_pct,stats.up7_avg);
  } else {
    document.getElementById('interp').innerHTML=L.interp[qtype](thresh,stats.count,stats.up1_pct,stats.up1_avg,stats.up30_pct,stats.up30_avg,ltc,ltca);
  }

  // table header
  const ths = _snapDate ? L.compTh : (qtype==='range' ? L.thRange : qtype==='wick' ? L.thWick : (qtype==='drop'?L.thDrop:L.thRise));
  if (!_snapDate) {
    document.getElementById('thead').innerHTML='<tr>'+ths.map(h=>`<th class="l">${h}</th>`).join('')+'</tr>';
  }

  renderTable();
  const res=document.getElementById('results');
  res.classList.add('show');

  // Animate bars after display becomes visible
  var barAnimIds = ['pb1','pb7','pb30'];
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      for (var bi = 0; bi < barAnimIds.length; bi++) {
        var b = document.getElementById(barAnimIds[bi]);
        var t = b ? b.dataset.targetWidth : null;
        if (t != null) {
          b.style.transition = 'none';
          b.style.width = '0%';
          b.offsetHeight;
          b.style.transition = '';
          b.style.width = t + '%';
        }
      }
    });
  });

  setTimeout(function(){ res.scrollIntoView({behavior:'smooth',block:'start'}); }, 80);
}

function mobileMetric(label, value, tone=''){
  return `<div class="mobile-event-metric"><span class="mobile-event-label">${label}</span><span class="mobile-event-value ${tone}">${value}</span></div>`;
}

function mobilePctTone(value){
  return value == null ? '' : (value >= 0 ? 'up' : 'dn');
}

function renderMobileHistory(rows){
  const host = document.getElementById('mobile-history');
  if(!host) return;
  const zh = lang === 'zh';
  host.innerHTML = rows.map(e => {
    const move = qtype === 'range' ? e.range_pct : qtype === 'wick' ? e.wick_depth : e.pct;
    const moveLabel = qtype === 'range' ? (zh?'振幅':'Swing') : qtype === 'wick' ? (zh?'插针深度':'Wick depth') : qtype === 'rise' ? (zh?'涨幅':'Rise') : (zh?'跌幅':'Drop');
    const close = e.close != null ? fp(e.close) : '-';
    const low = e.low != null ? fp(e.low) : '-';
    return `<article class="mobile-event">
      <div class="mobile-event-head">
        <button class="mobile-event-date" type="button" onclick="showSnapshot('${e.date}')">${e.date}</button>
        <span class="mobile-event-main ${move >= 0 && qtype !== 'drop' ? 'up' : 'dn'}">${pc(move)}</span>
      </div>
      <div class="mobile-event-grid">
        ${mobileMetric(moveLabel, pc(move), move >= 0 && qtype !== 'drop' ? 'up' : 'dn')}
        ${mobileMetric(zh?'收盘价':'Close', close)}
        ${mobileMetric(zh?'当日最低':'Day low', low, 'dn')}
        ${mobileMetric(zh?'最低到收盘':'Low to close', pc(e.low_to_close), mobilePctTone(e.low_to_close))}
        ${mobileMetric(zh?'次日':'Next day', pc(e.next1), mobilePctTone(e.next1))}
        ${mobileMetric(zh?'7日后':'After 7d', pc(e.next7), mobilePctTone(e.next7))}
        ${mobileMetric(zh?'30日后':'After 30d', pc(e.next30), mobilePctTone(e.next30))}
      </div>
    </article>`;
  }).join('');
  host.setAttribute('aria-label', zh ? '移动端历史记录' : 'Mobile historical records');
}

function renderTable(){
  if (_snapDate) { renderSnapshotTable(); return; }
  const rows=allRows.slice(0,shown);
  let html='';
  for(const e of rows){
    if(qtype==='wick'){
      html+=`<tr>
        <td class="date-col"><a href="javascript:void(0)" onclick="showSnapshot('${e.date}')" class="date-link">${e.date}</a></td>
        <td class="dn">${fp(e.low)}</td>
        <td>${fp(e.close)}</td>
        <td class="acc">${pc(e.wick_depth)}</td>
        <td>${pc(e.range_pct)}</td>
        <td class="${e.day_pct!=null&&e.day_pct>=0?'up':'dn'}">${e.day_pct!=null?pc(e.day_pct):'-'}</td>
        <td>${badge(e.next1)}</td>
        <td>${badge(e.next7)}</td>
        <td>${badge(e.next30)}</td>
      </tr>`;
    } else if(qtype==='range'){
      html+=`<tr>
        <td class="date-col"><a href="javascript:void(0)" onclick="showSnapshot('${e.date}')" class="date-link">${e.date}</a></td>
        <td class="up">${fp(e.high)}</td>
        <td class="dn">${fp(e.low)}</td>
        <td class="acc">${pc(e.range_pct)}</td>
        <td class="${e.close_pct>=0?'up':'dn'}">${pc(e.close_pct)}</td>
        <td class="${e.low_to_close!=null&&e.low_to_close>0?'up':'dn'}">${e.low_to_close!=null?pc(e.low_to_close):'-'}</td>
        <td>${badge(e.next1)}</td>
        <td>${badge(e.next7)}</td>
      </tr>`;
    } else {
      html+=`<tr>
        <td class="date-col"><a href="javascript:void(0)" onclick="showSnapshot('${e.date}')" class="date-link">${e.date}</a></td>
        <td>${fp(e.close)}</td>
        <td class="${e.pct>=0?'up':'dn'}">${pc(e.pct)}</td>
        <td class="dn">${e.low?fp(e.low):'-'}</td>
        <td class="${e.low_to_close!=null&&e.low_to_close>0?'up':'dn'}">${e.low_to_close!=null?pc(e.low_to_close):'-'}</td>
        <td>${badge(e.next1)}</td>
        <td>${badge(e.next7)}</td>
        <td>${badge(e.next30)}</td>
      </tr>`;
    }
  }
  document.getElementById('tbody').innerHTML=html;
  renderMobileHistory(rows);
  document.getElementById('tmeta').textContent=`${Math.min(shown,allRows.length)} / ${allRows.length}`;
  document.getElementById('morebtn').style.display=shown<allRows.length?'block':'none';
}

function renderSnapshotTable() {
  const date = _snapDate;
  const L = T[lang];
  // Set thead
  document.getElementById('thead').innerHTML = '<tr>' + L.compTh.map(h => '<th class="l">' + h + '</th>').join('') + '</tr>';
  // Collect data for all coins
  const rows = [];
  for (const code of COIN_ORDER) {
    const data = COIN_DATA[code];
    if (!data || !data.daily) continue;
    const day = data.daily.find(d => d.date === date);
    if (!day) continue;
    rows.push({ code, close: day.close, pct: day.pct, low: day.low, low_to_close: day.low_to_close, next1: day.next1, next7: day.next7, next30: day.next30 });
  }
  if (!rows.length) {
    document.getElementById('tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ink3);padding:24px">' + (lang === 'zh' ? '该日期无数据' : 'No data for this date') + '</td></tr>';
    const mobileHost = document.getElementById('mobile-history');
    if(mobileHost) mobileHost.innerHTML = `<div class="mobile-event">${lang === 'zh' ? '该日期无数据' : 'No data for this date'}</div>`;
    return;
  }
  const sorted = [...rows].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  let html = '';
  for (const r of sorted) {
    const color = COMP_COLORS[r.code] || '#f7931a';
    html += '<tr>' +
      '<td style="display:flex;align-items:center;gap:6px"><span class="comp-logo">' + COIN_LOGOS[r.code] + '</span><span style="font-weight:600;color:' + color + '">' + r.code + '</span></td>' +
      '<td>' + fp(r.close) + '</td>' +
      '<td class="' + (r.pct >= 0 ? 'up' : 'dn') + '">' + pc(r.pct) + '</td>' +
      '<td class="dn">' + (r.low ? fp(r.low) : '-') + '</td>' +
      '<td class="' + (r.low_to_close != null && r.low_to_close > 0 ? 'up' : 'dn') + '">' + (r.low_to_close != null ? pc(r.low_to_close) : '-') + '</td>' +
      '<td>' + badge(r.next1) + '</td>' +
      '<td>' + badge(r.next7) + '</td>' +
      '<td>' + badge(r.next30) + '</td>' +
      '</tr>';
  }
  document.getElementById('tbody').innerHTML = html;
  const mobileHost = document.getElementById('mobile-history');
  if(mobileHost){
    const zh = lang === 'zh';
    mobileHost.innerHTML = sorted.map(r => `<article class="mobile-event">
      <div class="mobile-event-head"><span class="mobile-event-date">${r.code}</span><span class="mobile-event-main ${mobilePctTone(r.pct)}">${pc(r.pct)}</span></div>
      <div class="mobile-event-grid">
        ${mobileMetric(zh?'收盘价':'Close', fp(r.close))}
        ${mobileMetric(zh?'当日最低':'Day low', fp(r.low), 'dn')}
        ${mobileMetric(zh?'最低到收盘':'Low to close', pc(r.low_to_close), mobilePctTone(r.low_to_close))}
        ${mobileMetric(zh?'次日':'Next day', pc(r.next1), mobilePctTone(r.next1))}
        ${mobileMetric(zh?'7日后':'After 7d', pc(r.next7), mobilePctTone(r.next7))}
        ${mobileMetric(zh?'30日后':'After 30d', pc(r.next30), mobilePctTone(r.next30))}
      </div>
    </article>`).join('');
  }
  // Hide "show more" button in snapshot mode
  document.getElementById('morebtn').style.display = 'none';
}

async function showSnapshot(date) {
  // Ensure all coins are loaded for comparison
  for (var ci = 0; ci < COIN_ORDER.length; ci++) {
    var code = COIN_ORDER[ci];
    if (!RAW_COINS[code]) {
      try { await loadCoinData(code); } catch(e) {}
    }
    if (RAW_COINS[code] && !COIN_DATA[code]) {
      COIN_DATA[code] = buildBtcData(RAW_COINS[code]);
    }
  }
  _snapDate = date;
  document.getElementById('tmeta').innerHTML = '<a href="javascript:void(0)" onclick="exitSnapshot()" style="color:var(--accent);text-decoration:none;font-size:12px">← ' + (lang === 'zh' ? '返回' : 'Back') + '</a>';
  renderSnapshotTable();
}

function exitSnapshot() {
  _snapDate = null;
  if (typeof allRows !== 'undefined' && allRows.length) {
    document.getElementById('tmeta').textContent = Math.min(shown, allRows.length) + ' / ' + allRows.length;
    if (typeof run === 'function') {
      const L = T[lang];
      const ths = qtype==='range' ? L.thRange : qtype==='wick' ? L.thWick : (qtype==='drop'?L.thDrop:L.thRise);
      document.getElementById('thead').innerHTML = '<tr>' + ths.map(h => '<th class="l">' + h + '</th>').join('') + '</tr>';
    }
    renderTable();
    document.getElementById('morebtn').style.display = shown < allRows.length ? 'block' : 'none';
  }
}
function showMore(){ shown=Math.min(shown+10, allRows.length); renderTable(); }

// ── REPORT ──
const BTC_CYCLE_HISTORY = [
  {cycle:'C1', halving:12, peak:1170, gain:9475, drawdown:-86.9, recovery:'1,065d'},
  {cycle:'C2', halving:650, peak:19666, gain:2925, drawdown:-84.1, recovery:'1,067d'},
  {cycle:'C3', halving:8821, peak:69000, gain:682, drawdown:-77.6, recovery:'739d'}
];

function reportRows(){
  return (BTC_DATA.daily || []).filter(d => d && d.date && Number.isFinite(d.close));
}
function ravg(arr){
  const v = arr.filter(n => Number.isFinite(n));
  return v.length ? v.reduce((s,n)=>s+n,0) / v.length : null;
}
function rmaxBy(arr, fn){
  return arr.reduce((best,item) => !best || fn(item) > fn(best) ? item : best, null);
}
function rminBy(arr, fn){
  return arr.reduce((best,item) => !best || fn(item) < fn(best) ? item : best, null);
}
function rdateDiff(a,b){
  return Math.max(0, Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z')) / 86400000));
}
function rpct(v, d=1){
  if(v == null || !Number.isFinite(v)) return '-';
  return (v > 0 ? '+' : '') + v.toFixed(d) + '%';
}
function rcolor(v){
  if(v == null || !Number.isFinite(v)) return '#94a3b8';
  return v >= 0 ? '#10b981' : '#ef4444';
}
function reportEvent(){
  if(qtype==='drop') return {
    events: BTC_DATA.drops.filter(e=>(e.pct_raw ?? e.pct)<=-thresh),
    stats: BTC_DATA.pre.drop[String(thresh)],
    zh:`${activeCoin} 单日收盘下跌至少 ${thresh}%`,
    en:`${activeCoin} close-to-close drop at least ${thresh}%`
  };
  if(qtype==='rise') return {
    events: BTC_DATA.rises.filter(e=>(e.pct_raw ?? e.pct)>=thresh),
    stats: BTC_DATA.pre.rise[String(thresh)],
    zh:`${activeCoin} 单日收盘上涨至少 ${thresh}%`,
    en:`${activeCoin} close-to-close rise at least ${thresh}%`
  };
  if(qtype==='wick') return {
    events: BTC_DATA.wick.events.filter(e=>(e.wick_depth_raw ?? e.wick_depth)>=thresh),
    stats: BTC_DATA.wick.pre[String(thresh)],
    zh:`${activeCoin} 当日低点到收盘回升至少 ${thresh}%`,
    en:`${activeCoin} low-to-close recovery at least ${thresh}%`
  };
  return {
    events: BTC_DATA.intraday.filter(e=>(e.range_pct_raw ?? e.range_pct)>=thresh),
    stats: BTC_DATA.pre.range[String(thresh)],
    zh:`${activeCoin} 当日高低振幅至少 ${thresh}%`,
    en:`${activeCoin} intraday high-low range at least ${thresh}%`
  };
}
function reportExtremes(rows){
  const ath = rmaxBy(rows, d => Number.isFinite(d.high) ? d.high : d.close);
  const atl = rminBy(rows, d => Number.isFinite(d.low) ? d.low : d.close);
  const maxRise = rmaxBy(rows, d => d.rise_to_high ?? d.pct);
  const maxDrop = rminBy(rows, d => d.drop_to_low ?? d.pct);
  const maxRiseMetric = maxRise ? (maxRise.rise_to_high ?? maxRise.pct) : null;
  const maxDropMetric = maxDrop ? (maxDrop.drop_to_low ?? maxDrop.pct) : null;
  const first = rows[0], latest = rows[rows.length-1];
  const totalReturn = first && latest ? (latest.close / first.close - 1) * 100 : null;
  const avgDaily = ravg(rows.map(d => d.pct));
  const avgVol = ravg(rows.map(d => d.pct == null ? null : Math.abs(d.pct)));
  const fromAth = ath && latest ? (latest.close / (ath.high || ath.close) - 1) * 100 : null;
  return {ath, atl, maxRise, maxDrop, maxRiseMetric, maxDropMetric, first, latest, totalReturn, avgDaily, avgVol, fromAth};
}
function reportBuckets(rows){
  const moves = rows.filter(d => Number.isFinite(d.pct));
  const defs = [
    ['> +10%', d => d.pct > 10, '#10b981'],
    ['+5% ~ +10%', d => d.pct > 5 && d.pct <= 10, '#10b981'],
    ['+3% ~ +5%', d => d.pct > 3 && d.pct <= 5, '#22c55e'],
    ['-3% ~ +3%', d => d.pct >= -3 && d.pct <= 3, '#94a3b8'],
    ['-3% ~ -5%', d => d.pct < -3 && d.pct >= -5, '#f97316'],
    ['-5% ~ -10%', d => d.pct < -5 && d.pct >= -10, '#ef4444'],
    ['< -10%', d => d.pct < -10, '#ef4444']
  ];
  return defs.map(([label, test, color]) => {
    const count = moves.filter(test).length;
    return {label, count, pct: moves.length ? count / moves.length * 100 : 0, color};
  });
}
function reportStreaks(rows){
  const up = [], down = [];
  let dir = 0, len = 0;
  const flush = () => {
    if(len > 1){
      if(dir > 0) up.push(len);
      if(dir < 0) down.push(len);
    }
  };
  rows.filter(d=>Number.isFinite(d.pct)).forEach(d => {
    const ndir = d.pct > 0 ? 1 : d.pct < 0 ? -1 : 0;
    if(ndir === 0){ flush(); dir = 0; len = 0; return; }
    if(ndir === dir) len += 1;
    else { flush(); dir = ndir; len = 1; }
  });
  flush();
  const bucket = arr => ({
    d2: arr.filter(n=>n===2).length,
    d3: arr.filter(n=>n===3).length,
    d4: arr.filter(n=>n===4).length,
    d57: arr.filter(n=>n>=5 && n<=7).length,
    d8: arr.filter(n=>n>7).length
  });
  return {
    maxUp: up.length ? Math.max(...up) : 0,
    maxDown: down.length ? Math.max(...down) : 0,
    avgUp: ravg(up) || 0,
    avgDown: ravg(down) || 0,
    upBucket: bucket(up),
    downBucket: bucket(down)
  };
}
function reportYearly(rows){
  const byYear = {};
  rows.forEach(d => {
    const y = d.date.slice(0,4);
    (byYear[y] ||= []).push(d);
  });
  const years = Object.keys(byYear).sort();
  const latestYear = rows[rows.length-1]?.date.slice(0,4);
  return years.map(y => {
    const a = byYear[y], first = a[0], last = a[a.length-1];
    const firstIndex = rows.indexOf(first);
    const prior = firstIndex > 0 ? rows[firstIndex-1] : null;
    const base = prior || first;
    return {
      year:y,
      label:y + (y === latestYear ? ' YTD' : ''),
      start:base.close,
      end:last.close,
      ret:(last.close / base.close - 1) * 100,
      vol:ravg(a.map(d=>d.pct == null ? null : Math.abs(d.pct))),
      up:a.filter(d=>d.pct>0).length,
      down:a.filter(d=>d.pct<0).length,
      flat:a.filter(d=>d.pct===0).length,
      partial:!prior
    };
  });
}
function reportDrawdowns(rows){
  if(!rows.length) return {worst:null, count20:0, avgDays:null};
  let peak = rows[0], active = null;
  const periods = [];
  rows.forEach(d => {
    if(d.close >= peak.close){
      if(active){ active.endDate = d.date; periods.push(active); active = null; }
      peak = d;
      return;
    }
    const dd = (d.close / peak.close - 1) * 100;
    if(dd <= -20 && !active){
      active = {peakDate:peak.date, peakPrice:peak.close, bottomDate:d.date, bottomPrice:d.close, dd};
    }
    if(active && dd < active.dd){
      active.bottomDate = d.date;
      active.bottomPrice = d.close;
      active.dd = dd;
    }
  });
  if(active) periods.push(active);
  periods.forEach(p => p.days = rdateDiff(p.peakDate, p.bottomDate));
  return {
    worst: periods.length ? rminBy(periods, p=>p.dd) : null,
    count20: periods.length,
    avgDays: periods.length ? ravg(periods.map(p=>p.days)) : null,
    top: periods.sort((a,b)=>a.dd-b.dd).slice(0,4)
  };
}
function reportSeasonality(rows){
  const periods = {};
  rows.forEach(d => (periods[d.date.slice(0,7)] ||= []).push(d));
  const monthly = Object.values(periods).map(a => {
    const first = a[0], last = a[a.length-1], firstIndex = rows.indexOf(first);
    const prior = firstIndex > 0 ? rows[firstIndex-1] : null;
    const base = prior || first;
    return {
      month:Number(first.date.slice(5,7)),
      ret:(last.close / base.close - 1) * 100,
      partial:!prior
    };
  });
  return Array.from({length:12}, (_,i) => {
    const samples = monthly.filter(m=>m.month===i+1 && !m.partial);
    return {
      month:i+1,
      avg:ravg(samples.map(m=>m.ret)),
      up:samples.length ? samples.filter(m=>m.ret>0).length / samples.length * 100 : null,
      count:samples.length
    };
  });
}
function rIcon(label, color){
  return `<span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:${color};color:#061018;align-items:center;justify-content:center;font-size:11px;font-weight:900;margin-right:8px">${label}</span>`;
}
function getLiveReportPrice(){
  const text = document.getElementById('tp')?.textContent || '';
  const value = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function openReport(){
  const zh = lang === 'zh';
  const ev = reportEvent();
  const stats = ev.stats;
  const rows = reportRows();
  if(!stats || !rows.length) return;

  const todayStr = new Date().toISOString().slice(0,10);
  const ext = reportExtremes(rows);
  const buckets = reportBuckets(rows);
  const streak = reportStreaks(rows);
  const yearly = reportYearly(rows).slice(-10);
  const dd = reportDrawdowns(rows);
  const months = reportSeasonality(rows);
  const bestMonth = rmaxBy(months, m => m.avg ?? -999);
  const worstMonth = rminBy(months, m => m.avg ?? 999);
  const maxBucket = Math.max(...buckets.map(b=>b.count), 1);
  const cycleClock = btcCycleContext();
  const bearDays = BTC_CYCLE_TIMING.bear.map(x=>x.days);
  const bullDays = BTC_CYCLE_TIMING.bull.map(x=>x.days);
  const halvingPeakDays = BTC_CYCLE_TIMING.bull.map(x=>x.halvingDays);
  const bearMin = Math.min(...bearDays), bearMax = Math.max(...bearDays);
  const stageComparisons = cycleClock ? btcCycleStageComparisons(cycleClock.daysSincePeak) : [];
  const title = zh ? `${activeCoin} 历史数据观察报告` : `${activeCoin} Historical Data Report`;
  const sub = zh ? '基于日线 OHLCV · 事实观察 · 不做预测' : 'Daily OHLCV observations · Facts only · No prediction';
  const eventLabel = zh ? ev.zh : ev.en;
  const livePrice = getLiveReportPrice();
  const displayPrice = livePrice || ext.latest?.close;
  const currentPrice = fmtPrice(displayPrice);
  const currentPriceNote = livePrice
    ? (zh ? `实时 · 日线截止 ${ext.latest.date}` : `live · daily through ${ext.latest.date}`)
    : (zh ? `日线收盘 · ${ext.latest.date}` : `daily close · ${ext.latest.date}`);
  const athPrice = fmtPrice(ext.ath?.high || ext.ath?.close);
  const fromAthValue = ext.ath && displayPrice ? (displayPrice / (ext.ath.high || ext.ath.close) - 1) * 100 : ext.fromAth;
  const fromAth = rpct(fromAthValue, 2);
  const sinceAth = ext.ath ? rdateDiff(ext.ath.date, ext.latest.date) : null;
  const card = (icon, label, value, note, color='#f7931a') => `
    <div style="background:#0f1319;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:13px;min-height:84px">
      <div style="display:flex;align-items:center;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${rIcon(icon,color)}${label}</div>
      <div style="font-size:22px;font-weight:900;color:${color};line-height:1.05">${value}</div>
      <div style="font-size:10px;color:#475569;margin-top:5px;line-height:1.35">${note || ''}</div>
    </div>`;
  const section = (label, body) => `
    <div style="margin-top:18px">
      <div style="font-size:10px;font-weight:900;color:#f7931a;letter-spacing:.13em;text-transform:uppercase;margin-bottom:9px">${label}</div>
      ${body}
    </div>`;
  const probColor = p => !Number.isFinite(p) ? '#94a3b8' : p >= 60 ? '#10b981' : p >= 50 ? '#f97316' : '#ef4444';
  const probCard = (label, p, avg, median, n) => card(
    'P',
    label,
    Number.isFinite(p) ? `${p}%` : '-',
    `${zh?'有效样本':'valid n'} ${n ?? '-'} · ${zh?'均值':'avg'} ${rpct(avg,2)} · ${zh?'中位数':'median'} ${rpct(median,2)}`,
    probColor(p)
  );
  const distRows = buckets.map(b => `
    <div style="display:grid;grid-template-columns:96px 62px 56px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div style="font-size:12px;font-weight:800;color:${b.color}">${b.label}</div>
      <div style="font-size:12px;color:#e2e8f0;text-align:right;font-weight:800">${b.count}</div>
      <div style="font-size:11px;color:#64748b;text-align:right">${b.pct.toFixed(1)}%</div>
      <div style="height:8px;background:#1e2533;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(3,b.count/maxBucket*100)}%;background:${b.color};border-radius:999px"></div></div>
    </div>`).join('');
  const yearlyRows = yearly.map(y => `
    <tr style="border-bottom:1px solid rgba(255,255,255,.05)">
      <td style="padding:8px 9px;color:#e2e8f0;font-weight:800">${y.label}</td>
      <td style="padding:8px 9px;text-align:right;color:${rcolor(y.ret)};font-weight:900">${rpct(y.ret,1)}</td>
      <td style="padding:8px 9px;text-align:right;color:#94a3b8">${Number.isFinite(y.vol) ? y.vol.toFixed(2)+'%' : '-'}</td>
      <td style="padding:8px 9px;text-align:right;color:#10b981">${y.up}</td>
      <td style="padding:8px 9px;text-align:right;color:#ef4444">${y.down}</td>
    </tr>`).join('');
  const cycleKeyRows = (() => {
    const halvingDay = nearestDaily('2024-04-20') || ext.first;
    const c4Halving = halvingDay?.close || null;
    const c4Peak = ext.ath?.high || ext.ath?.close || null;
    const c4Gain = c4Halving && c4Peak ? (c4Peak / c4Halving - 1) * 100 : null;
    const c4Drawdown = fromAthValue;
    return BTC_CYCLE_HISTORY.concat([{
      cycle:'C4',
      halving:c4Halving,
      peak:c4Peak,
      gain:c4Gain,
      drawdown:c4Drawdown,
      recovery:'-',
      current:true
    }]).map(c => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.06);${c.current?'background:rgba(247,147,26,.08)':''}">
        <td style="padding:9px 10px;color:${c.current?'#f7931a':'#94a3b8'};font-weight:950">${c.cycle}${c.current?' ▶':''}</td>
        <td style="padding:9px 10px;text-align:right;color:#94a3b8;font-weight:800">${fmtPrice(c.halving)}</td>
        <td style="padding:9px 10px;text-align:right;color:#94a3b8;font-weight:800">${fmtPrice(c.peak)}</td>
        <td style="padding:9px 10px;text-align:right;color:#10b981;font-weight:900">${rpct(c.gain,0)}</td>
        <td style="padding:9px 10px;text-align:right;color:#ef4444;font-weight:900">${rpct(c.drawdown,1)}${c.current ? (zh?' 至今':' so far') : ''}</td>
        <td style="padding:9px 10px;text-align:right;color:#94a3b8;font-weight:800">${c.recovery}</td>
      </tr>`).join('');
  })();
  const stageComparisonRows = cycleClock ? [{
    label:zh?'当前周期':'Current cycle',
    date:cycleClock.latest.date,
    close:cycleClock.latest.close,
    drawdown:cycleClock.drawdown,
    current:true
  }].concat(stageComparisons).map(row => `
    <tr style="border-bottom:1px solid rgba(255,255,255,.06);${row.current?'background:rgba(247,147,26,.08)':''}">
      <td style="padding:8px 10px;color:${row.current?'#f7931a':'#94a3b8'};font-weight:900">${row.label}</td>
      <td style="padding:8px 10px;text-align:right;color:#94a3b8">${row.date}</td>
      <td style="padding:8px 10px;text-align:right;color:#e2e8f0;font-weight:800">${fmtPrice(row.close)}</td>
      <td style="padding:8px 10px;text-align:right;color:#ef4444;font-weight:900">${rpct(row.drawdown,1)}</td>
    </tr>`).join('') : '';
  const btcCycle = activeCoin === 'BTC' ? section(zh?'BTC 历史周期刻度尺':'BTC HISTORICAL CYCLE RULER', `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
      ${card('T',zh?'最近样本高点后':'After latest sample high',cycleClock ? cycleClock.daysSincePeak+'d' : '-',cycleClock ? `${cycleClock.peak.date} → ${cycleClock.latest.date}` : '','#f7931a')}
      ${card('B',zh?'历史顶部到底部区间':'Historical peak-to-bottom range',`${bearMin}-${bearMax}d`,`${bearDays.join(' / ')}d · n=3`,'#ef4444')}
      ${card('H',zh?'历史低点到高点区间':'Historical low-to-peak range',`${Math.min(...bullDays)}-${Math.max(...bullDays)}d`,`${zh?'减半到高点':'halving to peak'} ${Math.min(...halvingPeakDays)}-${Math.max(...halvingPeakDays)}d`,'#94a3b8')}
    </div>
    <div style="margin:8px 2px 0;color:#64748b;font-size:9px;line-height:1.55">${zh?'时间样本来自 Bitstamp BTC/USD UTC 日线研究；当前高点、收盘和回撤来自 Yahoo Finance BTC-USD UTC 日线。三个历史样本只用于时间对照，不是见底日期或逃顶日期预测。':'Timing samples use the Bitstamp BTC/USD UTC daily study. The current sample high, close, and drawdown use Yahoo Finance BTC-USD UTC daily data. Three historical samples are context only, not bottom or top date forecasts.'}</div>
    <div style="margin-top:10px;background:#0f1319;border:1px solid rgba(255,255,255,.05);border-radius:10px;overflow:hidden">
      <div style="padding:10px 12px;color:#f7931a;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase">${zh?`第 ${cycleClock.daysSincePeak} 天同阶段回撤`:`Day ${cycleClock.daysSincePeak} stage comparison`}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="background:#151b25">
          <tr>
            <th style="padding:8px 10px;text-align:left;color:#64748b">${zh?'周期':'Cycle'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'同阶段日期':'Aligned date'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'当日收盘':'Close'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'距周期高点':'From peak'}</th>
          </tr>
        </thead>
        <tbody>${stageComparisonRows}</tbody>
      </table>
      <div style="padding:9px 10px;color:#64748b;font-size:9px;line-height:1.55">${zh?'按当前已完成日线天数对齐。明日完整日线进入后自动更新为下一天。本站数据从2017年开始，因此同阶段回撤仅展示两轮可验证历史样本，不提前展示未来结果。':'Aligned by completed daily candles. It advances automatically after the next complete daily candle. Data begins in 2017, so same-stage drawdown includes two verifiable prior cycles and never displays future results.'}</div>
    </div>
    <div style="margin-top:10px;background:#0f1319;border:1px solid rgba(255,255,255,.05);border-radius:10px;overflow:hidden">
      <div style="padding:10px 12px;color:#f7931a;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase">${zh?'价格周期摘要（口径见说明）':'Price-cycle summary (see methodology)'}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="background:#151b25">
          <tr>
            <th style="padding:8px 10px;text-align:left;color:#64748b">${zh?'周期':'Cycle'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'减半价':'Halving'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'峰值':'Peak'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'峰值涨幅':'Peak gain'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'最大回撤':'Max DD'}</th>
            <th style="padding:8px 10px;text-align:right;color:#64748b">${zh?'恢复天数':'Recovery'}</th>
          </tr>
        </thead>
        <tbody>${cycleKeyRows}</tbody>
      </table>
    </div>`) : section(zh?'市场阶段':'MARKET STAGE', `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
      ${card('S',zh?'数据起点':'Data start',ext.first.date,fmtPrice(ext.first.close),'#94a3b8')}
      ${card('A',zh?'样本期最高价':'Sample-period high',athPrice,ext.ath.date,'#f7931a')}
      ${card('D',zh?'距高点':'From ATH',fromAth,`${sinceAth} ${zh?'天':'days'} since ATH`,'#ef4444')}
    </div>`);
  const drawdownBody = dd.worst ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
      ${card('D',zh?'最深回撤':'Worst drawdown',rpct(dd.worst.dd,1),`${dd.worst.peakDate} → ${dd.worst.bottomDate}`,'#ef4444')}
      ${card('N',zh?'超过 -20% 回撤':'Drawdowns over -20%',dd.count20,zh?'按收盘价回撤区间统计':'close-price drawdown periods','#f97316')}
      ${card('T',zh?'平均触底天数':'Avg days to bottom',dd.avgDays ? Math.round(dd.avgDays)+'d' : '-',zh?'从阶段峰值到阶段低点':'peak to trough','#94a3b8')}
    </div>` : `
    <div style="background:#0f1319;border-radius:10px;padding:14px;color:#94a3b8">${zh?'当前数据区间内未形成超过 -20% 的完整回撤区间。':'No drawdown period deeper than -20% in the current dataset.'}</div>`;

  document.getElementById('rcard').innerHTML = `
<div style="background:#08090f;border-radius:14px;padding:26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#e2e8f0;min-width:760px;max-width:820px">
  <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08)">
    <div>
      <div style="font-size:24px;font-weight:950;color:#f7931a;letter-spacing:.02em">MY BTC BOX</div>
      <div style="font-size:18px;font-weight:900;color:#e2e8f0;margin-top:4px">${title}</div>
      <div style="font-size:11px;color:#64748b;margin-top:6px">${sub}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#64748b;line-height:1.6">
      <div>${zh?'生成':'Generated'}: ${todayStr}</div>
      <div>${zh?'数据截止':'Data through'}: ${BTC_DATA.data_through || ext.latest.date}</div>
      <div>Yahoo Finance ${BTC_DAILY_RAW.symbol || activeCoin+'-USD'}</div>
    </div>
  </div>

  ${section(zh?'当前查询':'CURRENT QUERY', `
    <div style="display:grid;grid-template-columns:1.1fr repeat(3,1fr);gap:9px">
      ${card('Q',zh?'查询条件':'Condition',eventLabel,`${stats.count} ${zh?'次历史样本':'historical samples'}`,'#f7931a')}
      ${probCard(zh?'次日收涨比例':'Next-day positive share', stats.up1_pct, stats.up1_avg, stats.med1, stats.n1)}
      ${probCard(zh?'7日后收涨比例':'7-day positive share', stats.up7_pct, stats.up7_avg, stats.med7, stats.n7)}
      ${probCard(zh?'30日后收涨比例':'30-day positive share', stats.up30_pct, stats.up30_avg, stats.med30, stats.n30)}
    </div>
    ${(stats.ltc_1_pct!=null && qtype!=='rise' && qtype!=='wick') ? `<div style="margin-top:9px;background:rgba(247,147,26,.08);border:1px solid rgba(247,147,26,.22);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:16px">
      <div style="font-size:12px;color:#e2e8f0;font-weight:800">${rIcon('L','#f7931a')}${zh?'当日低点回升':'Intraday low recovery'}</div>
      <div style="font-size:12px;color:#94a3b8;text-align:right">${zh?'收盘较最低价回升至少 1% 的历史比例':'Historical share closing at least 1% above the low'} <strong style="color:#f7931a;font-size:18px">${stats.ltc_1_pct}%</strong> · ${zh?'平均回升':'avg rebound'} ${rpct(stats.ltc_avg,2)}</div>
    </div>` : ''}
  `)}

  ${section(zh?'当前市场快照':'MARKET SNAPSHOT', `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">
      ${card('P',zh?'当前价格':'Current price',currentPrice,currentPriceNote,'#f7931a')}
      ${card('A',zh?'样本期最高价':'Sample-period high',athPrice,ext.ath.date,'#10b981')}
      ${card('R',zh?'距样本期高点':'From sample high',fromAth,zh?`高点距今 ${sinceAth} 天`:`sample high set ${sinceAth} days ago`,'#ef4444')}
      ${card('V',zh?'平均绝对日涨跌幅':'Avg absolute daily move',Number.isFinite(ext.avgVol) ? ext.avgVol.toFixed(2)+'%' : '-',zh?'非收益率标准差':'not return standard deviation','#94a3b8')}
    </div>
  `)}

  ${btcCycle}

  ${section(zh?'极端事件与整体收益':'EXTREMES AND TOTAL RETURN', `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">
      ${card('T',zh?'总收益率':'Total return',rpct(ext.totalReturn,1),`${ext.first.date} → ${ext.latest.date}`,'#10b981')}
      ${card('U',zh?'单日最高涨幅':'Max intraday up',rpct(ext.maxRiseMetric,2),ext.maxRise.date,'#10b981')}
      ${card('D',zh?'单日最大下探':'Max intraday drawdown',rpct(ext.maxDropMetric,2),ext.maxDrop.date,'#ef4444')}
      ${card('L',zh?'样本期最低价':'Sample-period low',fmtPrice(ext.atl.low || ext.atl.close),ext.atl.date,'#94a3b8')}
    </div>
  `)}

  ${section(zh?'涨跌幅分布':'DAILY MOVE DISTRIBUTION', `
    <div style="background:#0f1319;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:10px 14px">${distRows}</div>
  `)}

  ${section(zh?'连续涨跌节奏':'STREAKS', `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:9px">
      ${card('U',zh?'最长连涨':'Longest up streak',streak.maxUp+'d',`${zh?'平均':'avg'} ${streak.avgUp.toFixed(1)}d`,'#10b981')}
      ${card('D',zh?'最长连跌':'Longest down streak',streak.maxDown+'d',`${zh?'平均':'avg'} ${streak.avgDown.toFixed(1)}d`,'#ef4444')}
      ${card('M',zh?'历史最强月份':'Best calendar month','M'+bestMonth.month,`${zh?'平均月收益':'avg monthly return'} ${rpct(bestMonth.avg,2)} · n=${bestMonth.count}`,'#10b981')}
      ${card('M',zh?'历史最弱月份':'Weakest calendar month','M'+worstMonth.month,`${zh?'平均月收益':'avg monthly return'} ${rpct(worstMonth.avg,2)} · n=${worstMonth.count}`,'#ef4444')}
    </div>
  `)}

  ${section(zh?'年度表现':'YEARLY PERFORMANCE', `
    <div style="background:#0f1319;border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#161c26">
          ${(zh?['年份','年度/YTD涨跌','平均绝对日涨跌','上涨天数','下跌天数']:['Year','Annual/YTD return','Avg absolute move','Up days','Down days']).map(h=>`<th style="padding:9px;text-align:right;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.08em">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${yearlyRows}</tbody>
      </table>
      <div style="padding:9px 12px;color:#64748b;font-size:9px;line-height:1.55">${zh?'年度收益按上一年末收盘到本年末收盘计算；最新年份标记为 YTD。上涨/下跌天数不含平盘日。2017 为数据起始年的区间收益。':'Annual returns use the prior year-end close to the current year-end close; the latest year is YTD. Up/down counts exclude flat days. 2017 is a partial dataset-start return.'}</div>
    </div>
  `)}

  ${section(zh?'重大回撤':'MAJOR DRAWDOWNS', drawdownBody)}

  ${section(zh?'自动观察摘要':'AUTO-GENERATED OBSERVATIONS', `
    <div style="background:rgba(247,147,26,.08);border-left:3px solid #f7931a;border-radius:0 10px 10px 0;padding:13px 15px;font-size:12px;line-height:1.75;color:#cbd5e1">
      <div>${zh?'当前查询显示':'This query shows'} <strong style="color:#f7931a">${eventLabel}</strong> ${zh?'共出现':'occurred'} <strong>${stats.count}</strong> ${zh?'次。':'times.'}</div>
      <div>${zh?'样本内 30 日后收涨比例为':'The historical 30-day positive share was'} <strong style="color:${probColor(stats.up30_pct)}">${stats.up30_pct}%</strong> ${zh?'，平均表现为':'with an average move of'} <strong>${rpct(stats.up30_avg,2)}</strong>${zh?'，中位数为':' and a median of'} <strong>${rpct(stats.med30,2)}</strong>${zh?'。':'.'}</div>
      <div>${zh?'当前价格距样本期高点':'Current price is'} <strong style="color:#ef4444">${fromAth}</strong> ${zh?'，可与回撤和周期/阶段数据一起观察。':'from the sample-period high; compare it with drawdown and cycle/stage context.'}</div>
      <div style="color:#94a3b8;margin-top:4px">${zh?'历史数据只是观察材料，不构成买卖建议。':'Historical data is context only, not a trading signal.'}</div>
    </div>
  `)}

  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:14px;margin-top:18px;border-top:1px solid rgba(255,255,255,.08)">
    <div style="font-size:10px;color:#475569;max-width:560px;line-height:1.6">${zh?'样本期 OHLCV 来源：Yahoo Finance。事件阈值使用未四舍五入的收益率；结果按收盘价计算，盘中极值使用 high/low。相邻事件可能重叠，历史比例不是未来概率。报告不含手续费、滑点或未来预测。':'Sample-period OHLCV source: Yahoo Finance. Event thresholds use unrounded returns; outcomes use close prices and intraday extremes use high/low. Adjacent events may overlap, and historical shares are not future probabilities. Fees, slippage, and predictions are not included.'}</div>
    <div style="font-size:15px;font-weight:950;color:#f7931a;margin-left:18px">www.mybtcbox.com</div>
  </div>
</div>`;
  const shareMoveZh = qtype==='drop' ? '下跌' : qtype==='rise' ? '上涨' : qtype==='wick' ? '低点到收盘回升' : '振幅';
  const shareMoveEn = qtype==='drop' ? 'dropped' : qtype==='rise' ? 'rose' : qtype==='wick' ? 'recovered low-to-close' : 'moved';
  shareText = zh
    ? `刚刚用 My BTC Box 查了一下：当 ${activeCoin} 单日${shareMoveZh}至少 ${thresh}% 时，历史上发生了 ${stats.count} 次。样本内次日收涨比例 ${stats.up1_pct}%，30日后收涨比例 ${stats.up30_pct}%。历史比例不代表未来概率：${shareUrl('event')}`
    : `Just checked My BTC Box: when ${activeCoin} ${shareMoveEn} at least ${thresh}%, it happened ${stats.count} times. Historical positive share: next day ${stats.up1_pct}%, 30 days ${stats.up30_pct}%. Past shares are not future probabilities: ${shareUrl('event')}`;

  document.getElementById('overlay').classList.add('show');
}
function calcStratROI(stratVal, stratInv){ return stratInv ? ((stratVal / stratInv - 1) * 100) : 0; }
function fpShort(v){ return v == null || !Number.isFinite(v) ? '-' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
function rColor(v){ return v == null || !Number.isFinite(v) ? '#94a3b8' : v >= 0 ? '#10b981' : '#ef4444'; }

function openBacktestReport(){
  updateCB();
  const zh = lang === 'zh';
  const todayStr = new Date().toISOString().slice(0,10);
  const tx = id => (document.getElementById(id)?.textContent || '-').trim();
  const startDay = nearestDaily(document.getElementById('cb-start')?.value || '2017-01-01') || DAILY_SERIES[0];
  const tiered = !!document.getElementById('cb-tiered')?.checked;
  const amount = Math.max(1, parseFloat(document.getElementById('cb-amount')?.value) || 100);
  const fp = fmtDollars;
  const rules = getTierRules();
  const thresholdText = Number.isInteger(cbThresh) ? cbThresh : cbThresh.toFixed(1);
  const ruleText = tiered
    ? rules.map(r => `${r.threshold}% / ${fp(r.amount)}`).join(' + ')
    : `${thresholdText}% / ${fp(amount)}`;
  const methodText = tiered
    ? (zh ? '分层模式：以前一日收盘价为基准，用当日最低价判断触发，并按各层价格买入。' : 'Tiered mode: previous close is the reference price; intraday low triggers each tier; buys execute at tier prices.')
    : (zh ? '普通模式：按单日收盘跌幅触发，并按当日收盘价买入。' : 'Simple mode: triggered by close-to-close daily drop and bought at that day close.');
  const win = (leftId,rightId) => {
    const l=document.getElementById(leftId), r=document.getElementById(rightId);
    if(l?.classList.contains('metric-win')) return 'left';
    if(r?.classList.contains('metric-win')) return 'right';
    return 'tie';
  };
  const wl = w => w==='left' ? (zh?'条件买入':'conditional buying') : w==='right' ? (zh?'每周定投':'weekly DCA') : (zh?'接近':'tie');

  const btcW = win('cb-btc','cb-dca-btc');
  const profitW = win('cb-profit','cb-dca-profit');
  const roiW = win('cb-roi','cb-dca-roi');
  const valueW = win('cb-value','cb-dca-val');
  const avgW = win('cb-avg','cb-dca-avg');

  const yearly = calcYearlyBacktest(startDay.date, tiered, rules, amount);
  const monthlyTrigs = calcMonthlyTriggers(startDay.date);
  const monthlyROI = calcStrategyMonthlyROI(startDay.date, tiered, rules, amount);
  const drawdowns = calcBacktestDrawdowns(startDay.date, tiered, rules, amount);

  const yearKeys = Object.keys(yearly).sort();
  const yearlyRows = yearKeys.map(y => {
    const yr = yearly[y];
    const sRoi = yr.cumStratInv ? calcStratROI(yr.cumStratVal, yr.cumStratInv) : 0;
    const dRoi = yr.cumDcaInv ? calcStratROI(yr.cumDcaVal, yr.cumDcaInv) : 0;
    const w = yr.winner;
    return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);font-size:11px">
      <td style="padding:7px 8px;color:#e2e8f0;font-weight:700">${y}</td>
      <td style="padding:7px 8px;text-align:right;color:#f97316">${yr.stratTriggers}</td>
      <td style="padding:7px 8px;text-align:right;color:#e2e8f0">${fp(yr.stratInvested)}</td>
      <td style="padding:7px 8px;text-align:right;color:#e2e8f0">${yr.cumStratBtc.toFixed(4)}</td>
      <td style="padding:7px 8px;text-align:right;color:#94a3b8">${fp(Math.round(yr.cumStratVal))}</td>
      <td style="padding:7px 8px;text-align:right;color:${rColor(sRoi)};font-weight:${Math.abs(sRoi)>20?'900':'600'}">${fpShort(sRoi)}</td>
      <td style="padding:7px 8px;text-align:right;color:#94a3b8">${fp(Math.round(yr.cumDcaVal))}</td>
      <td style="padding:7px 8px;text-align:right;color:${rColor(dRoi)}">${fpShort(dRoi)}</td>
      <td style="padding:7px 8px;text-align:center;color:${w==='strat'?'#10b981':'#94a3b8'}">${w==='strat'?'✓':'-'}</td>
    </tr>`;
  }).join('');

  const bestYear = yearKeys.reduce((best, y) => (!best || yearly[y].stratROI > yearly[best].stratROI) ? y : best, null);
  const worstYear = yearKeys.reduce((worst, y) => (!worst || yearly[y].stratROI < yearly[worst].stratROI) ? y : worst, null);
  const dcaBestYear = yearKeys.reduce((best, y) => (!best || yearly[y].dcaROI > yearly[best].dcaROI) ? y : best, null);

  const trigMonthRows = monthlyTrigs.map((m,i) => {
    const mt = monthlyROI[i];
    return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);font-size:11px">
      <td style="padding:6px 8px;color:#e2e8f0;font-weight:600">${zh?'':'M'}${m.month}</td>
      <td style="padding:6px 8px;text-align:right;color:#f97316">${m.triggers}</td>
      <td style="padding:6px 8px;text-align:right;color:${mt?.stratAvg!=null ? rColor(mt.stratAvg) : '#475569'}">${mt?.stratAvg!=null ? fpShort(mt.stratAvg) : '-'}</td>
      <td style="padding:6px 8px;text-align:right;color:${mt?.dcaAvg!=null ? rColor(mt.dcaAvg) : '#475569'}">${mt?.dcaAvg!=null ? fpShort(mt.dcaAvg) : '-'}</td>
    </tr>`;
  }).join('');

  const conclusion = zh
    ? `累计币数：${wl(btcW)} 更高；盈利金额：${wl(profitW)} 更高；投入收益率：${wl(roiW)} 更高。`
    : `Asset accumulated: ${wl(btcW)} wins; profit: ${wl(profitW)} wins; return on invested capital: ${wl(roiW)} wins.`;

  const stratLabel = tiered ? (zh ? '分层买入' : 'Tiered') : (zh ? '条件买入' : 'Conditional');
  const stratVsDcaLabel = tiered ? (zh ? '分层 vs 定投' : 'Tiered vs DCA') : (zh ? '条件 vs 定投' : 'Conditional vs DCA');

  const maxTrigMonth = [...monthlyTrigs].sort((a,b) => b.triggers - a.triggers)[0];
  const minTrigMonth = [...monthlyTrigs].sort((a,b) => a.triggers - b.triggers)[0];

  const yearlyWins = yearKeys.filter(y => yearly[y].winner === 'strat').length;
  const yearlyTotal = yearKeys.length;
  const stratWinRate = yearlyTotal ? (yearlyWins / yearlyTotal * 100).toFixed(0) : 0;

  document.getElementById('rcard').innerHTML = `
<div style="background:#08090f;border-radius:14px;padding:26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#e2e8f0;min-width:680px;max-width:780px">
  <!-- HEADER -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08)">
    <div>
      <div style="font-size:20px;font-weight:950;color:#f7931a;letter-spacing:.04em">₿ MY BTC BOX</div>
      <div style="font-size:16px;font-weight:900;color:#e2e8f0;margin-top:4px">${zh?'回测报告':'BACKTEST REPORT'}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${activeCoin} · ${ruleText} · ${startDay.date} → ${LATEST_DAILY.date}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#64748b;line-height:1.6">
      <div>${zh?'生成':'Generated'}: ${todayStr}</div>
      <div>${zh?'数据截止':'Data through'}: ${LATEST_DAILY.date}</div>
    </div>
  </div>

  <!-- METHOD -->
  <div style="background:rgba(247,147,26,.07);border-left:3px solid #f7931a;border-radius:0 8px 8px 0;padding:11px 14px;margin-bottom:16px;font-size:12px;line-height:1.6;color:#cbd5e1">${methodText}</div>

  <!-- QUICK SUMMARY CARDS -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
    <div style="background:#0f1319;border-radius:8px;padding:12px;text-align:center;border:${btcW==='left'?'1px solid rgba(16,185,129,.3)':'1px solid transparent'}">
      <div style="font-size:9px;color:#475569;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${zh?'累计币数':'Asset'}</div>
      <div style="font-size:16px;font-weight:900;color:${btcW==='left'?'#10b981':'#e2e8f0'}">${tx('cb-btc')}</div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">${stratLabel}</div>
    </div>
    <div style="background:#0f1319;border-radius:8px;padding:12px;text-align:center;border:${profitW==='left'?'1px solid rgba(16,185,129,.3)':'1px solid transparent'}">
      <div style="font-size:9px;color:#475569;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${zh?'盈利金额':'Profit'}</div>
      <div style="font-size:16px;font-weight:900;color:${profitW==='left'?'#10b981':'#e2e8f0'}">${tx('cb-profit')}</div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">${stratLabel}</div>
    </div>
    <div style="background:#0f1319;border-radius:8px;padding:12px;text-align:center;border:${roiW==='left'?'1px solid rgba(16,185,129,.3)':'1px solid transparent'}">
      <div style="font-size:9px;color:#475569;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${zh?'收益率':'Return'}</div>
      <div style="font-size:16px;font-weight:900;color:${roiW==='left'?'#10b981':'#e2e8f0'}">${tx('cb-roi')}</div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">${stratLabel}</div>
    </div>
    <div style="background:#0f1319;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:9px;color:#475569;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${zh?'胜率':'Win Rate'}</div>
      <div style="font-size:16px;font-weight:900;color:#f7931a">${yearlyTotal ? stratWinRate : '-'}%</div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">${zh ? `过去 ${yearlyTotal} 年中 ${stratLabel} 胜出 ${yearlyWins} 年` : `${stratLabel} wins ${yearlyWins}/${yearlyTotal} yrs`}</div>
    </div>
  </div>

  <!-- DETAIL TABLE -->
  <div style="background:#0f1319;border-radius:8px;overflow:hidden;margin-bottom:16px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#161c26"><th style="padding:9px 8px;text-align:left;color:#64748b;font-size:9px;text-transform:uppercase">${zh?'指标':'Metric'}</th><th style="padding:9px 8px;text-align:right;color:#f7931a;font-size:9px;text-transform:uppercase">${stratLabel}</th><th style="padding:9px 8px;text-align:right;color:#94a3b8;font-size:9px;text-transform:uppercase">${zh?'每周定投':'Weekly DCA'}</th></tr></thead>
      <tbody>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'触发/周数':'Triggers / weeks'}</td><td style="padding:9px 8px;text-align:right;color:#e2e8f0;font-weight:800">${tx('cb-count')}</td><td style="padding:9px 8px;text-align:right;color:#e2e8f0;font-weight:800">${tx('cb-dca-weeks')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'总投入':'Invested'}</td><td style="padding:9px 8px;text-align:right;color:#e2e8f0;font-weight:800">${tx('cb-invested')}</td><td style="padding:9px 8px;text-align:right;color:#e2e8f0;font-weight:800">${tx('cb-dca-inv')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'累计币数':'Asset'}</td><td style="padding:9px 8px;text-align:right;color:${btcW==='left'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-btc')}</td><td style="padding:9px 8px;text-align:right;color:${btcW==='right'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-dca-btc')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'平均买入价':'Avg buy'}</td><td style="padding:9px 8px;text-align:right;color:${avgW==='left'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-avg')}</td><td style="padding:9px 8px;text-align:right;color:${avgW==='right'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-dca-avg')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'当前价值':'Value'}</td><td style="padding:9px 8px;text-align:right;color:${valueW==='left'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-value')}</td><td style="padding:9px 8px;text-align:right;color:${valueW==='right'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-dca-val')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'盈利金额':'Profit'}</td><td style="padding:9px 8px;text-align:right;color:${profitW==='left'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-profit')}</td><td style="padding:9px 8px;text-align:right;color:${profitW==='right'?'#10b981':'#e2e8f0'};font-weight:800">${tx('cb-dca-profit')}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 8px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em">${zh?'投入收益率':'ROI'}</td><td style="padding:9px 8px;text-align:right;color:${roiW==='left'?'#10b981':'#e2e8f0'};font-weight:900;font-size:13px">${tx('cb-roi')}</td><td style="padding:9px 8px;text-align:right;color:${roiW==='right'?'#10b981':'#e2e8f0'};font-weight:900;font-size:13px">${tx('cb-dca-roi')}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- YEAR BY YEAR -->
  ${yearKeys.length ? `
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:900;color:#f7931a;letter-spacing:.13em;text-transform:uppercase;margin-bottom:8px">${zh?'逐年比较 (累计)':'YEAR BY YEAR (CUMULATIVE)'}</div>
    <div style="background:#0f1319;border-radius:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:600px">
        <thead><tr style="background:#161c26">
          <th style="padding:7px 8px;text-align:left;color:#64748b;font-size:8px;text-transform:uppercase">${zh?'年份':'Year'}</th>
          <th style="padding:7px 8px;text-align:right;color:#f97316;font-size:8px;text-transform:uppercase">${zh?'触发':'Trig'}</th>
          <th style="padding:7px 8px;text-align:right;color:#64748b;font-size:8px;text-transform:uppercase">${zh?'投入':'Inv'}</th>
          <th style="padding:7px 8px;text-align:right;color:#e2e8f0;font-size:8px;text-transform:uppercase">${zh?'持有币数':'BTC'}</th>
          <th style="padding:7px 8px;text-align:right;color:#f7931a;font-size:8px;text-transform:uppercase">${stratLabel} ${zh?'价值':'Val'}</th>
          <th style="padding:7px 8px;text-align:right;color:#f7931a;font-size:8px;text-transform:uppercase">${stratLabel} ${zh?'收益率':'ROI'}</th>
          <th style="padding:7px 8px;text-align:right;color:#94a3b8;font-size:8px;text-transform:uppercase">${zh?'定投价值':'DCA Val'}</th>
          <th style="padding:7px 8px;text-align:right;color:#94a3b8;font-size:8px;text-transform:uppercase">${zh?'定投ROI':'DCA ROI'}</th>
          <th style="padding:7px 8px;text-align:center;color:#10b981;font-size:8px;text-transform:uppercase">${zh?'领先':'Lead'}</th>
        </tr></thead>
        <tbody>${yearlyRows}</tbody>
      </table>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
      <div style="background:#0f1319;border-radius:6px;padding:8px 10px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'最佳年份':'Best yr'}</div>
        <div style="font-size:15px;font-weight:900;color:#10b981">${bestYear||'-'}</div>
        <div style="font-size:9px;color:#64748b">${bestYear?fpShort(yearly[bestYear].stratROI):'-'}</div>
      </div>
      <div style="background:#0f1319;border-radius:6px;padding:8px 10px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'最差年份':'Worst yr'}</div>
        <div style="font-size:15px;font-weight:900;color:#ef4444">${worstYear||'-'}</div>
        <div style="font-size:9px;color:#64748b">${worstYear?fpShort(yearly[worstYear].stratROI):'-'}</div>
      </div>
      <div style="background:#0f1319;border-radius:6px;padding:8px 10px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'胜率':'Win rate'}</div>
        <div style="font-size:15px;font-weight:900;color:#f7931a">${yearlyTotal ? stratWinRate : '-'}%</div>
        <div style="font-size:9px;color:#64748b">${yearlyTotal ? (zh ? '过去 '+yearlyTotal+' 年中，有 '+yearlyWins+' 年 '+stratLabel+' 超过定投' : 'In '+yearlyTotal+' yrs, '+stratLabel+' won '+yearlyWins+' yrs' ) : '-'}</div>
      </div>
    </div>
  </div>` : ''}

  <!-- MONTHLY PATTERNS -->
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:900;color:#f7931a;letter-spacing:.13em;text-transform:uppercase;margin-bottom:8px">${zh?'月度分布':'MONTHLY PATTERNS'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div style="background:#0f1319;border-radius:6px;padding:9px 11px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'最多买入月份':'Most buys'}</div>
        <div style="font-size:16px;font-weight:900;color:#f97316">${zh?'':'M'}${maxTrigMonth.month}</div>
        <div style="font-size:9px;color:#64748b">${maxTrigMonth.triggers} ${zh?`次下跌超${thresholdText}%`:`drops >${thresholdText}%`}</div>
      </div>
      <div style="background:#0f1319;border-radius:6px;padding:9px 11px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'最少买入月份':'Fewest buys'}</div>
        <div style="font-size:16px;font-weight:900;color:#94a3b8">${zh?'':'M'}${minTrigMonth.month}</div>
        <div style="font-size:9px;color:#64748b">${minTrigMonth.triggers} ${zh?`次下跌超${thresholdText}%`:`drops >${thresholdText}%`}</div>
      </div>
    </div>
    <div style="background:#0f1319;border-radius:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#161c26">
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-size:8px;text-transform:uppercase">${zh?'月份':'Month'}</th>
          <th style="padding:6px 8px;text-align:right;color:#f97316;font-size:8px;text-transform:uppercase">${zh?'买入次数':'Buys'}</th>
          <th style="padding:6px 8px;text-align:right;color:#f7931a;font-size:8px;text-transform:uppercase">${stratLabel} ${zh?'平均收益率':'Avg ROI'}</th>
          <th style="padding:6px 8px;text-align:right;color:#94a3b8;font-size:8px;text-transform:uppercase">${zh?'定投平均收益率':'DCA Avg ROI'}</th>
        </tr></thead>
        <tbody>${trigMonthRows}</tbody>
      </table>
    </div>
  </div>

  <!-- DRAWDOWN -->
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:900;color:#f7931a;letter-spacing:.13em;text-transform:uppercase;margin-bottom:8px">${zh?'回撤分析':'DRAWDOWN ANALYSIS'}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div style="background:#0f1319;border-radius:6px;padding:9px 11px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${stratLabel} ${zh?'最大回撤':'Max DD'}</div>
        <div style="font-size:16px;font-weight:900;color:#ef4444">${drawdowns.strat.maxDd ? drawdowns.strat.maxDd.toFixed(1) + '%' : '-'}</div>
      </div>
      <div style="background:#0f1319;border-radius:6px;padding:9px 11px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'定投最大回撤':'DCA Max DD'}</div>
        <div style="font-size:16px;font-weight:900;color:${drawdowns.dca.maxDd < -20 ? '#ef4444' : '#94a3b8'}">${drawdowns.dca.maxDd ? drawdowns.dca.maxDd.toFixed(1) + '%' : '-'}</div>
      </div>
      <div style="background:#0f1319;border-radius:6px;padding:9px 11px">
        <div style="font-size:8px;color:#475569;text-transform:uppercase">${zh?'超过-20%回撤':'DDs > -20%'}</div>
        <div style="font-size:16px;font-weight:900;color:#f97316">${stratLabel}: ${drawdowns.strat.count20} / ${zh?'定投':'DCA'}: ${drawdowns.dca.count20}</div>
      </div>
    </div>
  </div>

  <!-- VERDICT -->
  <div style="background:rgba(16,185,129,.06);border-radius:8px;padding:13px 15px;margin-bottom:16px;font-size:12px;line-height:1.7;color:#cbd5e1">
    <strong style="color:#10b981">${zh?'对比结论':'COMPARISON'}:</strong> ${conclusion}
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.06);color:#94a3b8;font-size:11px;line-height:1.7">
      ${zh?`<strong>年度表现</strong>：过去 ${yearlyTotal} 年中，${stratLabel} 在 ${yearlyWins} 个年份（${stratWinRate}%）跑赢了每周定投。最佳年份 ${bestYear||'-'}（${bestYear?fpShort(yearly[bestYear].stratROI):'-'}），最差年份 ${worstYear||'-'}（${worstYear?fpShort(yearly[worstYear].stratROI):'-'}）。`:`<strong>Yearly track record:</strong> ${stratLabel} beat weekly DCA in ${yearlyWins} out of ${yearlyTotal} years (${stratWinRate}%). Best: ${bestYear||'-'} (${bestYear?fpShort(yearly[bestYear].stratROI):'-'}), worst: ${worstYear||'-'} (${worstYear?fpShort(yearly[worstYear].stratROI):'-'}).`}
    </div>
    <div style="margin-top:4px;color:#64748b;font-size:10px">
      ${zh?'提示：最大回撤衡量的是模拟组合净值的阶段性跌幅。策略受触发时机和投入频率影响，回撤表现可能与一次买入持有不同。':'Note: Drawdown measures simulated portfolio value declines. Strategy timing and frequency affect DD differently than buy-and-hold.'}
    </div>
  </div>

  <!-- FOOTER -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)">
    <div style="font-size:9px;color:#334155;max-width:420px;line-height:1.5">${zh?'历史回测，不构成投资建议。数据截止':'Historical backtest only. Not investment advice. Data through'} ${LATEST_DAILY.date}. ${zh?'不含手续费和滑点。':'Fees and slippage not included.'}</div>
    <div style="font-size:14px;font-weight:950;color:#f7931a;flex-shrink:0;margin-left:12px">www.mybtcbox.com</div>
  </div>
</div>`;

  shareText = zh
    ? `刚刚用 My BTC Box 回测了 ${activeCoin} 的条件买入策略：\n${ruleText}\n区间 ${startDay.date} → ${LATEST_DAILY.date}\n\n${stratLabel} 累计币数 ${tx('cb-btc')} · 收益率 ${tx('cb-roi')}\n定投 ${tx('cb-dca-btc')} · 收益率 ${tx('cb-dca-roi')}\n过去 ${yearlyTotal} 年跑赢定投 ${yearlyWins} 年（${stratWinRate}%）\n\n历史回测数据，不是投资建议。你会怎么调策略？${shareUrl('backtest')}`
    : `Backtested ${activeCoin} conditional buying vs weekly DCA:\n${ruleText}\n${startDay.date} → ${LATEST_DAILY.date}\n\n${stratLabel}: ${tx('cb-btc')} · ROI ${tx('cb-roi')}\nDCA: ${tx('cb-dca-btc')} · ROI ${tx('cb-dca-roi')}\n\nBeat DCA in ${yearlyWins}/${yearlyTotal}yrs (${stratWinRate}%). Past data only. Tweak the strategy: ${shareUrl('backtest')}`;
  document.getElementById('overlay').classList.add('show');
}
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }
function closeOuter(e){ if(e.target===document.getElementById('overlay')) closeModal(); }
function shareX(){ window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(shareText),'_blank','width=620,height=560'); }
function shareWeibo(){
  var kind=shareText.includes('回测')?'backtest':'event';
  var url=shareUrl(kind,'weibo');
  var title;
  if(kind==='backtest'){
    var btc = (document.getElementById('cb-btc')||{}).textContent || '-';
    var roi = (document.getElementById('cb-roi')||{}).textContent || '-';
    title = lang==='zh'
      ? '用 My BTC Box 回测了 '+activeCoin+' 条件买入策略。'+btc+'枚 · 收益率 '+roi+'。历史回测，不构成建议→'
      : 'Backtested '+activeCoin+' conditional buying: '+btc+' BTC · ROI '+roi+'. Past data only→';
  }else{
    var count = (document.getElementById('sn')||{}).textContent || '-';
    var up1 = (document.getElementById('pu1')||{}).textContent || '-';
    title = lang==='zh'
      ? '刚刚用 My BTC Box 查到：当 '+activeCoin+' 单日跌幅至少 '+thresh+'% 时，历史上发生了 '+count+' 次，样本内次日收涨比例 '+up1+'。历史比例不代表未来概率。'
      : 'My BTC Box: when '+activeCoin+' dropped at least '+thresh+'%, it happened '+count+' times. The historical next-day positive share was '+up1+'. Past shares are not future probabilities.';
  }
  window.open('https://service.weibo.com/share/share.php?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title)+'&appkey=&searchPic=true','_blank','width=620,height=560');
}
function copyLink(){
  var url=shareUrl(shareText.includes('回测')?'backtest':'event','copy');
  var text = shareText + '\n' + url;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      toast(lang==='zh'?'链接已复制':'Link copied');
    }).catch(function(){
      fallbackCopy(text);
    });
  }else{
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  var ta=document.createElement('textarea');
  ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{document.execCommand('copy')}catch(e){}
  document.body.removeChild(ta);
  toast(lang==='zh'?'链接已复制':'Link copied');
}

function dlRpt(){
  const btn = document.getElementById('dl-btn');
  if(!btn) return;
  const origHTML = btn.innerHTML;
  btn.innerHTML = lang==='zh' ? '⏳ 生成中...' : '⏳ Generating...';
  btn.disabled = true;

  const card = document.getElementById('rcard');
  // 临时让卡片字体内联，确保html2canvas能渲染
  html2canvas(card, {
    backgroundColor: '#08090f',
    scale: 2.5,
    useCORS: true,
    allowTaint: true,
    logging: false,
    onclone: (doc) => {
      // 确保字体加载
      const el = doc.getElementById('rcard');
      el.style.fontFamily = 'Arial, sans-serif';
    }
  }).then(canvas => {
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0,10);
    link.download = 'mybtcbox-' + activeCoin.toLowerCase() + '-' + today + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    btn.innerHTML = lang==='zh' ? '✓ 已下载' : '✓ Downloaded';
    btn.disabled = false;
    setTimeout(()=>{ btn.innerHTML = origHTML; }, 2000);
  }).catch(err => {
    console.error('html2canvas error:', err);
    btn.innerHTML = origHTML;
    btn.disabled = false;
    toast(lang==='zh' ? '请截图保存报告卡片' : 'Please screenshot the report card');
  });
}

// ── HISTORY BAR INIT ──
function initHistBar() {
  var input = document.getElementById('hist-date');
  if (!input) return;
  // Compute common date range from all coins
  var minDate = null, maxDate = null;
  for (var ci = 0; ci < COIN_ORDER.length; ci++) {
    var data = COIN_DATA[COIN_ORDER[ci]];
    if (!data || !data.daily || !data.daily.length) continue;
    var first = data.daily[0].date;
    var last = data.data_through || data.daily[data.daily.length - 1].date;
    if (!minDate || first > minDate) minDate = first;
    if (!maxDate || last < maxDate) maxDate = last;
  }
  if (minDate) {
    input.min = minDate;
    input.max = maxDate;
    input.value = maxDate;
    var hint = document.getElementById('hist-date-hint');
    if (hint) hint.textContent = minDate + ' → ' + maxDate;
  }
  // Button click → show snapshot
  var btn = document.getElementById('hist-comp-btn');
  if (btn) {
    btn.addEventListener('click', function() {
      if (input.value) showSnapshot(input.value);
    });
  }
  // Date change → auto-show snapshot
  input.addEventListener('change', function() {
    if (this.value) showSnapshot(this.value);
  });
}
setTimeout(initHistBar, 100);

// ── LIVE ──
function tickH(){
  const d=NEXT_HALF-Date.now(); if(d<=0){document.getElementById('th').textContent='NOW!';return;}
  const dy=Math.floor(d/864e5),h=String(Math.floor(d/36e5%24)).padStart(2,'0'),m=String(Math.floor(d/6e4%60)).padStart(2,'0'),s=String(Math.floor(d/1e3%60)).padStart(2,'0');
  document.getElementById('th').textContent=`${dy}d ${h}h ${m}m ${s}s`;
}
setInterval(tickH,1000); tickH();

async function fetchProxyJson(url){
  const res = await fetch(PX + encodeURIComponent(url));
  if(!res.ok) throw new Error('proxy ' + res.status);
  return res.json();
}
function fundingColor(rate){
  return rate > 0.05 ? '#ef4444' : rate > 0.015 ? '#f97316' : rate < -0.01 ? '#60a5fa' : '#10b981';
}
function fundingLabel(rate){
  return rate > 0.05 ? (lang==='zh'?'过热':'hot') : rate > 0.015 ? (lang==='zh'?'偏热':'warm') : rate < -0.01 ? (lang==='zh'?'偏空':'short bias') : (lang==='zh'?'正常':'normal');
}
function lsColor(ratio){
  return ratio > 1.5 ? '#ef4444' : ratio > 1.2 ? '#f97316' : ratio < 0.8 ? '#60a5fa' : '#10b981';
}
function setMetricUnavailable(id, title){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = '-';
  el.style.color = '#64748b';
  el.title = title;
}
async function updateMarketSentiment(){
  const out = { fundingRate:null, lsRatio:null };
  try{
    const fd = await fetchProxyJson('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP');
    const rate = parseFloat(fd?.data?.[0]?.fundingRate) * 100;
    const el = document.getElementById('tfr');
    if(el && Number.isFinite(rate)){
      out.fundingRate = rate;
      el.textContent = (rate >= 0 ? '+' : '') + rate.toFixed(3) + '%';
      el.style.color = fundingColor(rate);
      el.title = lang==='zh'
        ? 'OKX BTC-USDT 永续资金费率 · ' + fundingLabel(rate)
        : 'OKX BTC-USDT perpetual funding rate · ' + fundingLabel(rate);
    }else{
      setMetricUnavailable('tfr', lang==='zh'?'资金费率暂不可用':'Funding unavailable');
    }
  }catch(e){
    setMetricUnavailable('tfr', lang==='zh'?'资金费率暂不可用':'Funding unavailable');
  }

  try{
    const ld = await fetchProxyJson('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC');
    const ratio = parseFloat(ld?.data?.[0]?.[1]);
    const el = document.getElementById('tls');
    if(el && Number.isFinite(ratio)){
      out.lsRatio = ratio;
      el.textContent = ratio.toFixed(2);
      el.style.color = lsColor(ratio);
      el.title = lang==='zh'
        ? 'OKX BTC 合约账户多空比'
        : 'OKX BTC contract account long/short ratio';
    }else{
      setMetricUnavailable('tls', lang==='zh'?'多空比暂不可用':'L/S unavailable');
    }
  }catch(e){
    setMetricUnavailable('tls', lang==='zh'?'多空比暂不可用':'L/S unavailable');
  }
  // Fear & Greed Index
  try{
    const fgResp = await fetch('https://api.alternative.me/fng/?limit=1');
    const fgD = await fgResp.json();
    const el = document.getElementById('tfg');
    if(el && fgD?.data?.[0]?.value){
      const val = parseInt(fgD.data[0].value);
      const label = fgD.data[0].value_classification;
      el.textContent = val + ' ' + (label||'');
      el.style.color = val <= 25 ? '#ef4444' : val <= 45 ? '#f97316' : val <= 55 ? '#eab308' : val <= 75 ? '#22c55e' : '#10b981';
      el.title = lang==='zh'?'恐惧贪婪指数: '+label:'Fear & Greed: '+label;
    }else{ setMetricUnavailable('tfg', '-'); }
  }catch(e){ setMetricUnavailable('tfg', '-'); }
  // BTC Dominance uses the same proxy as prices to avoid browser CORS variance.
  try{
    const domD = await fetchProxyJson('https://api.coingecko.com/api/v3/global');
    const el = document.getElementById('tdom');
    const btcDom = domD?.data?.market_cap_percentage?.btc;
    if(el && Number.isFinite(btcDom)){
      el.textContent = btcDom.toFixed(1) + '%';
      el.style.color = btcDom > 55 ? '#22c55e' : btcDom > 45 ? '#94a3b8' : '#f97316';
      el.title = lang==='zh'?'BTC市占率':'BTC Dominance';
    }else{ setMetricUnavailable('tdom', '-'); }
  }catch(e){ setMetricUnavailable('tdom', '-'); }
  MARKET_SENTIMENT = out;
  MARKET_LIVE_STATE.sentiment = Number.isFinite(out.fundingRate) || Number.isFinite(out.lsRatio) ? 'live' : 'unavailable';
  if(MARKET_LIVE_STATE.sentiment === 'live') MARKET_LIVE_STATE.lastUpdated = new Date().toISOString();
  return out;
}

async function updatePrice(){
  renderTopTicker();
  await updateMarketDashboard();
  await updateMarketSentiment();
}
updatePrice(); setInterval(updatePrice,60000);

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800); }

// init
async function initializeApp(){
  applyLang();
  if(requestedCoin !== activeCoin) await selectCoin(requestedCoin);
  else updateCB();
  if(hasRequestedQuery){
    qtype=requestedQueryType;
    document.getElementById('qtype').value=requestedQueryType;
    onType();
    setT(requestedQueryThreshold);
    run();
  }
  if(requestedMode === 'backtest'){
    const tool=document.getElementById('backtest-tool');
    const startInput=document.getElementById('cb-start');
    const amountInput=document.getElementById('cb-amount');
    if(tool) tool.open=true;
    if(startInput && /^\d{4}-\d{2}-\d{2}$/.test(requestedBacktestStart)) startInput.value=requestedBacktestStart;
    if(amountInput && Number.isFinite(requestedBacktestAmount) && requestedBacktestAmount >= 1) amountInput.value=String(requestedBacktestAmount);
    if(Number.isFinite(requestedBacktestThreshold) && requestedBacktestThreshold >= 1 && requestedBacktestThreshold <= 80) setCBThresh(requestedBacktestThreshold);
    updateCB();
  }
}
initializeApp();
if(typeof navigator!=='undefined' && 'serviceWorker' in navigator){
  window.addEventListener('load',() => navigator.serviceWorker.register('/sw.js').catch(() => {}),{once:true});
}
