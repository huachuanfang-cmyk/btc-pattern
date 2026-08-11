const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const methodologyHtml = fs.readFileSync('methodology.html', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const robots = fs.readFileSync('robots.txt', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const toolFunction = fs.readFileSync('functions/tools/[slug].js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const statusHtml = fs.readFileSync('status.html', 'utf8');
const statusScript = fs.readFileSync('assets/status.js', 'utf8');
const toolsHtml = fs.readFileSync('tools/index.html', 'utf8');
const toolsStyles = fs.readFileSync('assets/tools.css', 'utf8');
const coreScript = fs.readFileSync('assets/core.js', 'utf8');
const backtestCoreScript = fs.readFileSync('assets/backtest-core.js', 'utf8');
const reportCoreScript = fs.readFileSync('assets/report-core.js', 'utf8');
const appScript = fs.readFileSync('assets/app.js', 'utf8');
function readPngInfo(path) {
  const bytes = fs.readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}
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
  setAttribute(name, value) { this[name] = value; }
  scrollIntoView() {}
}

function createContext(startDate = '2017-01-01', pageWindow = {}) {
  const elements = new Map();
  const storage = new Map();
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
    window: pageWindow,
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
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
  vm.runInContext(coreScript, context);
  vm.runInContext(backtestCoreScript, context);
  vm.runInContext(reportCoreScript, context);
  vm.runInContext(appScript, context);
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
const latestSignal = latestSignalForData(BTC_DATA);
const btcLast = BTC_DATA.daily[BTC_DATA.daily.length - 1];
const syntheticRangeSignal = latestSignalForData({...BTC_DATA, daily:[{...btcLast, pct:0.5, pct_raw:0.5, range_pct:9, range_pct_raw:9, low_to_close:1, low_to_close_raw:1}]});
const syntheticWickSignal = latestSignalForData({...BTC_DATA, daily:[{...btcLast, pct:0.5, pct_raw:0.5, range_pct:6, range_pct_raw:6, low_to_close:5.5, low_to_close_raw:5.5}]});
localStorage.removeItem(DAILY_VISIT_KEY);
const habitFirst = updateDailyVisit(BTC_DATA.daily[BTC_DATA.daily.length-2].date);
const habitSecond = updateDailyVisit(btcLast.date);
const habitRepeat = updateDailyVisit(btcLast.date);
COIN_DATA.BTC = {...BTC_DATA, daily:[...BTC_DATA.daily.slice(0,-1), {...btcLast, pct:-8.2, pct_raw:-8.2}]};
renderDailySignals();
const dailySignalHtml = document.getElementById('daily-signal-list').innerHTML;
const dailySignalCount = document.getElementById('daily-scan-count').textContent;
COIN_DATA.BTC = BTC_DATA;
activeCoin = 'BTC';
qtype = 'drop';
thresh = 8;
saveCurrentQuery();
const savedQueryHtml = document.getElementById('saved-queries').innerHTML;
const savedQueryStorage = localStorage.getItem(SAVED_QUERY_KEY);
renderCycleRuler();
const cycleRulerHtml = document.getElementById('cycle-ruler').innerHTML;
const cycleClock = btcCycleContext();
const cycleStage = btcCycleStageComparisons(cycleClock.daysSincePeak);
renderDailyObservation();
const dailyBriefHtml = document.getElementById('daily-brief').innerHTML;
const dailyBriefContext = dailyObservationContext();
const dailySharePayload = dailyObservationSharePayload();
MARKET_PRICES.BTC = { price: 100000, change24h: 2.5 };
MARKET_SENTIMENT = { fundingRate: 0.002, lsRatio: 1.43 };
const initialBtcAth = BTC_DATA._ath;
activeCoin = 'DOGE';
BTC_DATA = buildBtcData(RAW_COINS.DOGE);
COIN_DATA.DOGE = BTC_DATA;
MARKET_PRICES = { BTC:{ price:100000, change24h:2.5 }, DOGE:{ price:0.11, change24h:-3.4 } };
renderMarketDashboard();
updateDynamicCopy();
run();
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
  latestSignalDate: latestSignal.date,
  syntheticRangeKind: syntheticRangeSignal.kind,
  syntheticWickKind: syntheticWickSignal.kind,
  dailySignalHtml,
  dailySignalCount,
  savedQueryHtml,
  savedQueryStorage,
  cycleRulerHtml,
  dailyBriefHtml,
  dailyBriefChange:dailyBriefContext.drawdownChange,
  dailyBriefExpectedChange:dailyBriefContext.drawdown - dailyBriefContext.previousDrawdown,
  dailySharePayload,
  habitFirst,
  habitSecond,
  habitRepeat,
  cyclePeakDate: cycleClock.peak.date,
  cycleDaysSincePeak: cycleClock.daysSincePeak,
  cycleExpectedDays: utcDayDiff(cycleClock.peak.date, cycleClock.latest.date),
  cycleStage,
  tickerSymbol: document.getElementById('ticker-symbol').textContent,
  tickerPrice: document.getElementById('tp').textContent,
  heroTitle: document.getElementById('hero-title').innerHTML,
  mobileHistory: document.getElementById('mobile-history').innerHTML,
  probSample: document.getElementById('pa30').textContent,
  eventShareUrl: shareUrl('event','test'),
  backtestShareUrl: shareUrl('backtest','test'),
});
`, context);

assertEqual(result.activeAth, result.btcAth, 'Initial ACTIVE_ATH should use BTC data ATH');
assertEqual(result.yearTriggers, result.manualTriggers, 'First backtest year should start at selected date');
assertEqual(result.yearDcaInv, result.manualDcaInv, 'First-year DCA should start at selected date');
assertEqual(result.janMonthly, result.janManual, 'Monthly triggers should use the current threshold');
assertEqual(result.winnerByRoiMatches, true, 'Yearly winner should be based on cumulative ROI');
assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(result.latestSignalDate), true, 'Latest signal should expose a daily candle date');
assertEqual(result.syntheticRangeKind, 'range', 'Latest signal should detect a completed daily range event');
assertEqual(result.syntheticWickKind, 'wick', 'Latest signal should detect a completed daily wick event');
assertEqual(result.dailySignalHtml.includes("openDailySignal('BTC','drop',8)"), true, 'Triggered daily signal should open the matching historical query');
assertEqual(result.dailySignalCount.includes('1/5'), true, 'Daily scan should disclose how many assets triggered');
assertEqual(result.savedQueryHtml.includes('BTC 收盘跌幅至少 8%'), true, 'Saved query should render a readable local shortcut');
assertEqual(result.savedQueryStorage.includes('"coin":"BTC"'), true, 'Saved query should persist on the current device');
assertEqual(result.cycleRulerHtml.includes('BTC 历史周期刻度尺'), true, 'Homepage should render the BTC historical cycle ruler');
assertEqual(result.cycleRulerHtml.includes('cycle-range-label'), true, 'Cycle ruler should group crowded historical timing markers into one readable label');
assertEqual(result.cycleRulerHtml.includes('363 / 376 / 411d'), true, 'Cycle ruler should show all three peak-to-bottom timing samples');
assertEqual(result.cycleRulerHtml.includes('不是见底日期或逃顶日期预测'), true, 'Cycle ruler should explicitly reject date forecasting');
assertEqual(result.cyclePeakDate, '2025-10-06', 'Cycle ruler should derive the latest BTC sample high from daily data');
assertEqual(result.cycleDaysSincePeak, result.cycleExpectedDays, 'Cycle clock should use completed UTC daily candles');
assertEqual(result.cycleRulerHtml.includes('距历史最早触底样本还有 56 天'), true, 'Cycle ruler should explain the distance to the earliest historical sample');
assertEqual(result.dailyBriefHtml.includes('今日观察'), true, 'Homepage should render the daily observation summary');
assertEqual(result.dailyBriefHtml.includes('回撤较前一日'), true, 'Daily observation should compare drawdown with the prior completed candle');
assertEqual(result.dailyBriefHtml.includes(`周期计时推进至第${result.cycleDaysSincePeak}天`), true, 'Daily observation should advance with the completed cycle clock');
assertEqual(Number(result.dailyBriefChange.toFixed(8)), Number(result.dailyBriefExpectedChange.toFixed(8)), 'Daily drawdown change should use the same sample high for both completed candles');
assertEqual(result.habitFirst.streak, 1, 'First local observation should start a one-day streak');
assertEqual(result.habitSecond.streak, 2, 'Next completed data day should extend the local observation streak');
assertEqual(result.habitRepeat.streak, 2, 'Repeated renders on the same data day should not inflate the streak');
assertEqual(result.dailyBriefHtml.includes('连续观察 <strong>2</strong> 个数据日'), true, 'Daily observation should show the local data-day streak');
assertEqual(result.dailyBriefHtml.includes('已保存 <strong>1</strong> 个条件'), true, 'Daily observation should show the saved-query count');
assertEqual(result.dailyBriefHtml.includes('今日 <strong>0</strong> 个触发'), true, 'Daily observation should show how many saved conditions triggered today');
assertEqual(result.dailyBriefHtml.includes('我的条件'), true, 'Daily observation should expose saved conditions without opening another view');
assertEqual(result.dailyBriefHtml.includes('BTC 跌 8%'), true, 'Daily observation should label each saved condition compactly');
assertEqual(result.dailyBriefHtml.includes('未触发'), true, 'Daily observation should disclose the current state of each saved condition');
assertEqual(result.dailyBriefHtml.includes('分享今日观察'), true, 'Daily observation should provide a direct sharing action');
assertEqual(result.dailySharePayload.url.includes('view=daily'), true, 'Daily observation share URL should open the daily homepage context');
assertEqual(result.dailySharePayload.url.includes(result.latestSignalDate), true, 'Daily observation share URL should preserve the data date');
assertEqual(result.dailySharePayload.text.includes('不预测涨跌'), true, 'Daily observation share copy should retain the forecasting boundary');
assertEqual(result.cycleStage.length, 2, 'Same-stage comparison should include two verifiable prior cycles');
assertEqual(Number(result.cycleStage[0].drawdown.toFixed(1)), -70.5, 'Previous cycle day-aligned drawdown should match source daily data');
assertEqual(result.tickerSymbol, 'DOGE', 'Top ticker should follow selected asset');
assertEqual(result.tickerPrice, '$0.1100', 'Top ticker should use shared live price data for selected asset');
assertEqual(result.heroTitle.includes('狗狗币'), true, 'Hero title should follow the selected asset');
assertEqual(result.mobileHistory.includes('30日后'), true, 'Mobile history should retain long-horizon outcomes');
assertEqual(result.probSample.includes('样本'), true, 'Probability copy should disclose its valid sample denominator');
assertEqual(result.eventShareUrl.includes('asset=doge'), true, 'Shared event URL should preserve the selected asset');
assertEqual(result.eventShareUrl.includes('type=drop'), true, 'Shared event URL should preserve the event type');
assertEqual(result.eventShareUrl.includes('threshold=8'), true, 'Shared event URL should preserve the event threshold');
assertEqual(result.backtestShareUrl.includes('start=2024-06-01'), true, 'Shared backtest URL should preserve the selected start date');
assertEqual(result.backtestShareUrl.includes('drop=8'), true, 'Shared backtest URL should preserve the drop threshold');
assertEqual(result.backtestShareUrl.includes('amount=100'), true, 'Shared backtest URL should preserve the buy amount');

const presetContext = createContext('2017-01-01', {
  location: { search: '' },
  MYBTCBOX_PRESET: { asset: 'btc', type: 'wick', threshold: 5 },
});
const presetState = vm.runInContext(`({
  requestedCoin,
  requestedQueryType,
  requestedQueryThreshold,
  hasRequestedQuery
})`, presetContext);
assertEqual(presetState.requestedCoin, 'BTC', 'Tool route preset should select its configured asset');
assertEqual(presetState.requestedQueryType, 'wick', 'Tool route preset should select its configured event type');
assertEqual(presetState.requestedQueryThreshold, 5, 'Tool route preset should select its configured threshold');
assertEqual(presetState.hasRequestedQuery, true, 'A valid tool route preset should automatically run the real query');

const backtestPresetContext = createContext('2017-01-01', {
  location: { search: '' },
  MYBTCBOX_PRESET: { asset: 'btc', mode: 'backtest', start: '2020-01-01', drop: 5, amount: 100 },
});
const backtestPresetState = vm.runInContext(`({
  requestedMode,
  requestedBacktestStart,
  requestedBacktestThreshold,
  requestedBacktestAmount
})`, backtestPresetContext);
assertEqual(backtestPresetState.requestedMode, 'backtest', 'Backtest tool route should select backtest mode');
assertEqual(backtestPresetState.requestedBacktestStart, '2020-01-01', 'Backtest tool route should preserve its start date');
assertEqual(backtestPresetState.requestedBacktestThreshold, 5, 'Backtest tool route should preserve its threshold');
assertEqual(backtestPresetState.requestedBacktestAmount, 100, 'Backtest tool route should preserve its amount');

assertEqual(html.includes('id="pulse-score"'), false, 'Homepage should not include a proprietary market score');
assertEqual(html.includes('id="daily-brief"'), true, 'Homepage should include the daily observation mount point');
assertEqual(html.includes('id="liq-status"'), false, 'Homepage should not include the large real-time market watch card');
assertEqual(html.includes('id="heat-row"'), false, 'Homepage should not include the duplicate five-asset heat strip');
assertEqual(html.includes('<div class="results" id="results">'), true, 'Historical results should start hidden until the user runs a query');
assertEqual(html.includes('<details class="secondary-tool" id="backtest-tool"'), true, 'Backtest should live behind a secondary tool disclosure');

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
thresh = 3;
openReport();
const reportHtml = document.getElementById('rcard').innerHTML;
const reportYears = reportYearly(reportRows());
const reportMonths = reportSeasonality(reportRows());
const reportExt = reportExtremes(reportRows());
const bestMonth = rmaxBy(reportMonths, m => m.avg ?? -999);
({
  hasCycleTable: reportHtml.includes('价格周期摘要（口径见说明）') && reportHtml.includes('C4 ▶') && reportHtml.includes('恢复天数'),
  hasMethodLabels: reportHtml.includes('样本期最低价') && reportHtml.includes('2026 YTD') && reportHtml.includes('有效样本 427'),
  hasCycleTimingDisclosure: reportHtml.includes('BTC 历史周期刻度尺') && reportHtml.includes('363-411d') && reportHtml.includes('不是见底日期或逃顶日期预测'),
  hasStageComparison: reportHtml.includes('第 307 天同阶段回撤') && reportHtml.includes('2021-2022') && reportHtml.includes('-70.5%') && reportHtml.includes('不提前展示未来结果'),
  omitsTautologicalRecovery: !reportHtml.includes('96.3%') && reportHtml.includes('回升至少 1%'),
  drop3Count: BTC_DATA.pre.drop['3'].count,
  drop3NextDayShare: BTC_DATA.pre.drop['3'].up1_pct,
  drop3Median30: BTC_DATA.pre.drop['3'].med30,
  drop3LowRecovery1: BTC_DATA.pre.drop['3'].ltc_1_pct,
  annual2024: Number(reportYears.find(y=>y.year==='2024').ret.toFixed(1)),
  annual2026Label: reportYears.find(y=>y.year==='2026').label,
  bestMonth: bestMonth.month,
  bestMonthReturn: Number(bestMonth.avg.toFixed(1)),
  totalReturn: Number(reportExt.totalReturn.toFixed(1)),
  logosHaveLabels: Object.values(COIN_LOGOS).every(svg => svg.includes('aria-label') && svg.includes('viewBox="0 0 32 32"')),
});
`, context);

assertEqual(reportUi.hasCycleTable, true, 'BTC report should include four-cycle key data');
assertEqual(reportUi.hasMethodLabels, true, 'Report should expose sample-period, YTD, and effective-sample labels');
assertEqual(reportUi.hasCycleTimingDisclosure, true, 'Report should include the historical cycle timing ruler and forecast boundary');
assertEqual(reportUi.hasStageComparison, true, 'BTC report should include an automatically advancing same-stage drawdown comparison');
assertEqual(reportUi.omitsTautologicalRecovery, true, 'Report should replace the tautological positive low-to-close metric');
assertEqual(reportUi.drop3Count, 427, '3% drop threshold should use unrounded returns');
assertEqual(reportUi.drop3NextDayShare, 56, '3% drop next-day positive share should match the source dataset');
assertEqual(reportUi.drop3Median30, 1.98, 'Report should expose the 30-day median outcome');
assertEqual(reportUi.drop3LowRecovery1, 53.6, 'Low recovery should require at least a 1% rebound');
assertEqual(reportUi.annual2024, 121.1, '2024 return should use the prior year-end close');
assertEqual(reportUi.annual2026Label, '2026 YTD', 'Latest partial year should be labeled YTD');
assertEqual(reportUi.bestMonth, 10, 'Best calendar month should use compounded monthly returns');
assertEqual(reportUi.bestMonthReturn, 18.2, 'Best calendar month should report average monthly return');
assertEqual(reportUi.totalReturn, 6395.4, 'Total return should start at the first available close');
assertEqual(reportUi.logosHaveLabels, true, 'Coin snapshot logos should use labeled 32x32 SVGs');
assertEqual(html.includes('id="st-health"'), true, 'Homepage should expose the current dataset health');
assertEqual(html.includes('href="methodology.html"'), true, 'Homepage should link to the data methodology page');
assertEqual(methodologyHtml.includes('健康判断规则'), true, 'Methodology page should publish the health thresholds');
assertEqual(methodologyHtml.includes('收盘涨跌幅'), true, 'Methodology page should publish indicator formulas');
assertEqual(methodologyHtml.includes('data/health.js'), true, 'Methodology page should use the lightweight health manifest');
assertEqual(methodologyHtml.includes('超过2个UTC日未更新即标记延迟'), true, 'Methodology page should publish the operational stale-data threshold');
assertEqual(methodologyHtml.includes('SHA-256'), true, 'Methodology page should expose the published dataset checksum');
assertEqual(headers.includes('/data/*'), true, 'Hosting headers should cover published data files');
assertEqual(headers.includes('max-age=0, must-revalidate'), true, 'Published daily data should not remain silently stale in browser cache');
assertEqual(headers.includes('/sw.js'), true, 'Service worker updates should always be revalidated');
assertEqual(headers.includes('/assets/*'), true, 'Application modules should always be revalidated after deployment');
assertEqual(html.includes('<link rel="canonical" href="https://www.mybtcbox.com/">'), true, 'Homepage should publish one stable canonical URL');
assertEqual(html.includes('"@type":"WebApplication"'), true, 'Homepage should publish WebApplication structured data');
assertEqual(robots.includes('Sitemap: https://www.mybtcbox.com/sitemap.xml'), true, 'Robots file should disclose the sitemap');
assertEqual(sitemap.includes('<loc>https://www.mybtcbox.com/</loc>'), true, 'Sitemap should include the core tool homepage');
assertEqual(sitemap.includes('<loc>https://www.mybtcbox.com/methodology.html</loc>'), true, 'Sitemap should include the public methodology page');
assertEqual(sitemap.includes('<loc>https://www.mybtcbox.com/status.html</loc>'), true, 'Sitemap should include the public data status page');
assertEqual(sitemap.includes('<loc>https://www.mybtcbox.com/tools/</loc>'), true, 'Sitemap should include the public tool directory');
assertEqual(statusHtml.includes('id="status-summary"'), true, 'Status page should expose an accessible live summary');
assertEqual(statusHtml.includes('/data/health.json'), true, 'Status page should link the machine-readable health manifest');
assertEqual(statusScript.includes("expected=['BTC','ETH','SOL','DOGE','BNB']"), true, 'Status page should require all five published assets');
assertEqual(statusScript.includes("lag<=2"), true, 'Status page should apply the documented two-UTC-day freshness threshold');
for (const slug of ['btc-drop-history','btc-rise-history','btc-volatility-history','btc-wick-history','btc-cycle-clock','btc-conditional-buy-backtest']) {
  assertEqual(toolFunction.includes(`'${slug}'`), true, `Pages Function should define the ${slug} tool route`);
  assertEqual(sitemap.includes(`<loc>https://www.mybtcbox.com/tools/${slug}</loc>`), true, `Sitemap should include the ${slug} tool route`);
  assertEqual(toolsHtml.includes(`href="/tools/${slug}"`), true, `Tool directory should link to the ${slug} route`);
}
assertEqual(toolFunction.includes('window.MYBTCBOX_PRESET='), true, 'Tool routes should reuse the real query app with a route preset');
assertEqual(toolFunction.includes("url: canonical"), true, 'Each tool route should publish its own structured-data URL');
assertEqual(toolFunction.includes('twitter:title'), true, 'Each tool route should publish route-specific Twitter metadata');
assertEqual(toolFunction.includes("'@type': 'BreadcrumbList'"), true, 'Each tool route should publish breadcrumb structured data');
assertEqual(toolFunction.includes('class="route-explainer"'), true, 'Each tool route should include a crawlable method explanation');
assertEqual(toolFunction.includes('计算口径：'), true, 'Each tool route should label its calculation method');
assertEqual(toolsHtml.includes('"@type":"CollectionPage"'), true, 'Tool directory should publish CollectionPage structured data');
assertEqual(toolsHtml.includes('共同数据原则'), true, 'Tool directory should disclose shared data principles');
assertEqual(toolsStyles.includes('@media(max-width:720px)'), true, 'Tool directory should include a compact mobile layout');
assertEqual(manifest.display, 'standalone', 'Web app manifest should support a standalone home-screen experience');
assertEqual(manifest.icons.some(icon => icon.sizes === '192x192' && icon.type === 'image/png'), true, 'Web app manifest should include the Chromium 192px PNG icon');
assertEqual(manifest.icons.some(icon => icon.sizes === '512x512' && icon.type === 'image/png'), true, 'Web app manifest should include the Chromium 512px PNG icon');
assertEqual(manifest.icons.every(icon => icon.purpose.includes('maskable')), true, 'Web app manifest icons should support adaptive launchers');
for (const size of [192, 512]) {
  const icon = readPngInfo(`app-icon-${size}.png`);
  assertEqual(icon.width, size, `PWA ${size}px icon should have the declared width`);
  assertEqual(icon.height, size, `PWA ${size}px icon should have the declared height`);
  assertEqual(icon.colorType, 2, `PWA ${size}px icon should use non-transparent RGB pixels`);
}
assertEqual(manifest.shortcuts.length, 3, 'Installed app should expose three useful tool shortcuts');
assertEqual(serviceWorker.includes("fetch(request)"), true, 'Service worker should try the network before cached data');
assertEqual(serviceWorker.indexOf('fetch(request)') < serviceWorker.indexOf('caches.match(request)'), true, 'Service worker should not prefer stale cached daily data');
assertEqual(html.includes('href="/assets/app.css"'), true, 'Homepage should load the extracted application stylesheet');
assertEqual(html.includes('src="/assets/core.js"'), true, 'Homepage should load the independently testable calculation core');
assertEqual(html.includes('src="/assets/backtest-core.js"'), true, 'Homepage should load the independently testable backtest core');
assertEqual(html.includes('src="/assets/report-core.js"'), true, 'Homepage should load the independently testable report core');
assertEqual(html.includes('src="/assets/app.js"'), true, 'Homepage should load the extracted application controller');
for (const asset of ['/assets/app.css', '/assets/core.js', '/assets/backtest-core.js', '/assets/report-core.js', '/assets/app.js']) {
  assertEqual(serviceWorker.includes(`'${asset}'`), true, `Offline shell should cache ${asset}`);
}
for (const asset of ['/status.html', '/assets/status.css', '/assets/status.js', '/data/health.js']) {
  assertEqual(serviceWorker.includes(`'${asset}'`), true, `Offline shell should cache status resource ${asset}`);
}
for (const asset of ['/tools/', '/assets/tools.css']) {
  assertEqual(serviceWorker.includes(`'${asset}'`), true, `Offline shell should cache tool directory resource ${asset}`);
}
assertEqual(html.includes('rel="manifest" href="/manifest.webmanifest"'), true, 'Homepage should link the web app manifest');
assertEqual(html.includes('rel="apple-touch-icon" href="/app-icon-180.png"'), true, 'Homepage should provide an iOS home-screen icon');
assertEqual(appScript.includes("navigator.serviceWorker.register('/sw.js')"), true, 'Application controller should register the service worker');

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
