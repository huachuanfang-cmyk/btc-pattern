const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(script => script.includes('function buildBtcData'));

class ClassList {
  constructor() { this.items = new Set(); }
  add(...names) { names.forEach(name => this.items.add(name)); }
  remove(...names) { names.forEach(name => this.items.delete(name)); }
  toggle(name, force) {
    if (force === undefined ? !this.items.has(name) : force) this.items.add(name);
    else this.items.delete(name);
  }
  contains(name) { return this.items.has(name); }
}

class ElementStub {
  constructor(id = '', withOptions = false) {
    this.id = id;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.style = {};
    this.className = '';
    this.classList = new ClassList();
    this.options = withOptions ? [{}, {}, {}, {}] : [];
    this.dataset = {};
    this.placeholder = '';
    this.title = '';
  }
  addEventListener() {}
  scrollIntoView() {}
}

function createContext(startDate = '2017-01-01') {
  const elements = new Map();
  function getElementById(id) {
    if (!elements.has(id)) {
      const el = new ElementStub(id, id === 'qtype');
      if (id === 'qtype') el.value = 'drop';
      if (id === 'cb-start') el.value = startDate;
      if (id === 'cb-amount') el.value = '100';
      if (id === 'results') el.classList.add('show');
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const document = {
    getElementById,
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '#cb-thresh-btns .tb' || selector === '.tb') {
        return [3, 5, 8, 10, 15].map(n => Object.assign(new ElementStub(), { textContent: String(n) }));
      }
      if (selector === '.lbtn') {
        return ['EN', '中文'].map(text => Object.assign(new ElementStub(), { textContent: text }));
      }
      return [];
    },
    createElement() { return new ElementStub(); },
    head: new ElementStub('head'),
    body: new ElementStub('body'),
  };

  const context = {
    console,
    window: {},
    document,
    localStorage: { getItem() { return null; }, setItem() {} },
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    parseInt,
    parseFloat,
    setTimeout() {},
    setInterval() {},
    requestAnimationFrame(cb) { cb(); },
    fetch: async (url = '') => {
      const href = String(url);
      if (href.includes('simple/price')) {
        return { ok: true, json: async () => ({
          bitcoin: { usd: 100000, usd_24h_change: 2.5 },
          ethereum: { usd: 3500, usd_24h_change: -1.2 },
          solana: { usd: 180, usd_24h_change: 4.2 },
          dogecoin: { usd: 0.11, usd_24h_change: -3.4 },
          binancecoin: { usd: 650, usd_24h_change: 0.6 },
        }) };
      }
      if (href.includes('funding-rate')) {
        return { ok: true, json: async () => ({ code: '0', data: [{ fundingRate: '0.00002166' }] }) };
      }
      if (href.includes('long-short-account-ratio')) {
        return { ok: true, json: async () => ({ code: '0', data: [['1778985300000', '1.43']] }) };
      }
      return { ok: true, json: async () => ({ market_data: { current_price: { usd: 100000 }, price_change_percentage_24h: 0 } }) };
    },
    html2canvas: () => Promise.resolve({ toDataURL() { return ''; } }),
  };
  vm.createContext(context);

  for (const coin of ['btc', 'eth', 'sol', 'doge', 'bnb']) {
    vm.runInContext(fs.readFileSync(`data/${coin}.daily.js`, 'utf8'), context);
  }
  vm.runInContext(inlineScript, context);
  return context;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: ${actual} !== ${expected}`);
  }
}

const context = createContext('2024-06-01');
vm.runInContext(`
function manualWeeklyRowsRangeForTest(startDate, endDate) {
  const rows = [];
  let d = startDate;
  while (d <= endDate) {
    const day = nearestDaily(d);
    if (day && day.date <= endDate && (!rows.length || rows[rows.length - 1].date !== day.date)) rows.push(day);
    d = addDays(d, 7);
  }
  return rows;
}
`, context);

const result = vm.runInContext(`
setCBThresh(8);
const years = calcYearlyBacktest('2024-06-01', false, getTierRules(), 100);
const year = years['2024'];
const manualEligible = DAILY_SERIES.filter(d => d.date >= '2024-06-01' && d.date <= '2024-12-31' && d.pct != null);
const manualTriggers = manualEligible.filter(d => d.pct <= -cbThresh).length;
const manualDcaInv = manualWeeklyRowsRangeForTest('2024-06-01', '2024-12-31').length * 100;
const janMonthly = calcMonthlyTriggers('2024-01-01')[0].triggers;
const janManual = DAILY_SERIES.filter(d => d.date >= '2024-01-01' && d.date <= '2024-01-31' && d.pct <= -cbThresh).length;
const winnerByRoiMatches = Object.values(years).every(y => y.winner === (y.stratROI > y.dcaROI ? 'strat' : 'dca'));
const pulseScore = marketPulseScore({ change24h: 2.5, fromAth: -20, fundingRate: 0.002, lsRatio: 1.43 });
const pulseState = marketPulseState(pulseScore);
const latestSignal = latestSignalForData(BTC_DATA);
MARKET_PRICES.BTC = { price: 100000, change24h: 2.5 };
MARKET_SENTIMENT = { fundingRate: 0.002, lsRatio: 1.43 };
renderMarketWatch();
const watchStatus = document.getElementById('liq-status').textContent;
const watchBtc = document.getElementById('watch-btc').textContent;
const watchFunding = document.getElementById('watch-funding').textContent;
const initialBtcAth = BTC_DATA._ath;
activeCoin = 'DOGE';
BTC_DATA = buildBtcData(RAW_COINS.DOGE);
COIN_DATA.DOGE = BTC_DATA;
MARKET_PRICES = { BTC:{ price:100000, change24h:2.5 }, DOGE:{ price:0.11, change24h:-3.4 } };
renderMarketDashboard();
({
  activeAth: ACTIVE_ATH,
  btcAth: initialBtcAth,
  yearTriggers: year.stratTriggers,
  manualTriggers,
  yearDcaInv: year.dcaInv,
  manualDcaInv,
  janMonthly,
  janManual,
  winnerByRoiMatches,
  pulseScore,
  pulseStateKey: pulseState.key,
  latestSignalDate: latestSignal.date,
  watchStatus,
  watchBtc,
  watchFunding,
  tickerSymbol: document.getElementById('ticker-symbol').textContent,
  tickerPrice: document.getElementById('tp').textContent,
  heatClickable: document.getElementById('heat-row').innerHTML.includes('openCoinChart'),
});
`, context);

assertEqual(result.activeAth, result.btcAth, 'Initial ACTIVE_ATH should use BTC data ATH');
assertEqual(result.yearTriggers, result.manualTriggers, 'First backtest year should start at selected date');
assertEqual(result.yearDcaInv, result.manualDcaInv, 'First-year DCA should start at selected date');
assertEqual(result.janMonthly, result.janManual, 'Monthly triggers should use the current threshold');
assertEqual(result.winnerByRoiMatches, true, 'Yearly winner should be based on cumulative ROI');
assertEqual(result.pulseScore >= 0 && result.pulseScore <= 100, true, 'Market pulse should be clamped to 0-100');
assertEqual(['cold', 'cautious', 'balanced', 'warm', 'hot'].includes(result.pulseStateKey), true, 'Market pulse should return a known state');
assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(result.latestSignalDate), true, 'Latest signal should expose a daily candle date');
assertEqual(result.watchStatus, 'Live data', 'Market watch should replace unstable liquidation status');
assertEqual(result.watchBtc, '+2.50%', 'Market watch should show BTC 24H');
assertEqual(result.watchFunding, '+0.002%', 'Market watch should show funding');
assertEqual(result.tickerSymbol, 'DOGE', 'Top ticker should follow selected asset');
assertEqual(result.tickerPrice, '$0.1100', 'Top ticker should use shared live price data for selected asset');
assertEqual(result.heatClickable, false, 'Heat strip should stay as a compact live overview, not open the removed chart experiment');

const dogeExtremes = vm.runInContext(`
const dogeRows = buildBtcData(RAW_COINS.DOGE).daily;
const ext = reportExtremes(dogeRows);
({
  athDate: ext.ath.date,
  athHigh: Number(ext.ath.high.toFixed(8)),
  maxRiseDate: ext.maxRise.date,
  maxRiseMetric: Number(ext.maxRiseMetric.toFixed(2)),
  maxDropDate: ext.maxDrop.date,
  maxDropMetric: Number(ext.maxDropMetric.toFixed(2)),
});
`, context);

assertEqual(dogeExtremes.athDate, '2021-05-08', 'DOGE ATH should use daily high');
assertEqual(dogeExtremes.athHigh, 0.73757, 'DOGE ATH high should match app-rounded Yahoo OHLCV high');
assertEqual(dogeExtremes.maxRiseDate, '2021-01-28', 'DOGE max daily rise should use intraday high date');
assertEqual(dogeExtremes.maxRiseMetric, 356.79, 'DOGE max daily rise should be high versus previous close');
assertEqual(dogeExtremes.maxDropDate, '2021-05-19', 'DOGE max daily drop should use intraday low date');
assertEqual(dogeExtremes.maxDropMetric, -54.16, 'DOGE max daily drop should be low versus previous close');

const reportUi = vm.runInContext(`
setLang('zh');
activeCoin = 'BTC';
BTC_DAILY_RAW = RAW_COINS.BTC;
BTC_DATA = buildBtcData(BTC_DAILY_RAW);
DAILY_SERIES = BTC_DATA.daily;
LATEST_DAILY = DAILY_SERIES[DAILY_SERIES.length - 1];
ACTIVE_ATH = BTC_DATA._ath;
setCBThresh(8);
openReport();
const reportHtml = document.getElementById('rcard').innerHTML;
({
  hasCycleTable: reportHtml.includes('四周期关键数据') && reportHtml.includes('C4 ▶') && reportHtml.includes('恢复天数'),
  logosHaveLabels: Object.values(COIN_LOGOS).every(svg => svg.includes('aria-label') && svg.includes('viewBox="0 0 32 32"')),
});
`, context);

assertEqual(reportUi.hasCycleTable, true, 'BTC report should include four-cycle key data');
assertEqual(reportUi.logosHaveLabels, true, 'Coin snapshot logos should use labeled 32x32 SVGs');

const sentimentContext = createContext();
const sentimentResult = vm.runInContext(`
updateMarketSentiment().then((sentiment) => ({
  fundingRate: Number(sentiment.fundingRate.toFixed(3)),
  lsRatio: sentiment.lsRatio,
  fundingText: document.getElementById('tfr').textContent,
  fundingColor: document.getElementById('tfr').style.color,
  fundingTitle: document.getElementById('tfr').title,
  lsText: document.getElementById('tls').textContent,
  lsColor: document.getElementById('tls').style.color,
  lsTitle: document.getElementById('tls').title,
}));
`, sentimentContext);

sentimentResult.then(result => {
  assertEqual(result.fundingRate, 0.002, 'Funding return value should use percent units');
  assertEqual(result.lsRatio, 1.43, 'L/S return value should be numeric');
  assertEqual(result.fundingText, '+0.002%', 'Funding should parse OKX funding rate as percent');
  assertEqual(result.fundingColor, '#10b981', 'Normal funding should be green');
  assertEqual(result.fundingTitle.includes('OKX BTC-USDT'), true, 'Funding tooltip should disclose OKX source');
  assertEqual(result.lsText, '1.43', 'L/S should parse OKX long-short ratio');
  assertEqual(result.lsColor, '#f97316', 'Warm L/S should be orange');
  assertEqual(result.lsTitle.includes('OKX BTC'), true, 'L/S tooltip should disclose OKX source');
}).then(() => {
  runCopyChecks();
}).catch(err => {
  console.error(err);
  process.exit(1);
});

function runCopyChecks() {
const copyContext = createContext();
const copyResult = vm.runInContext(`
setLang('zh');
const zhPlaceholder = document.getElementById('cb-custom-thresh').placeholder;
const zhHint = document.getElementById('cb-custom-hint').textContent;
setLang('en');
const enPlaceholder = document.getElementById('cb-custom-thresh').placeholder;
const enHint = document.getElementById('cb-custom-hint').textContent;
({ zhPlaceholder, zhHint, enPlaceholder, enHint });
`, copyContext);

assertEqual(copyResult.zhPlaceholder, '自定义%', 'Chinese custom threshold placeholder should be plain');
assertEqual(copyResult.zhHint, '可选固定跌幅，或输入自定义跌幅', 'Chinese custom threshold hint should explain the input');
assertEqual(copyResult.enPlaceholder, 'Custom %', 'English custom threshold placeholder should be plain');
assertEqual(copyResult.enHint, 'Choose a fixed drop, or enter your own drop %', 'English custom threshold hint should explain the input');

console.log('index regression checks passed');
}
