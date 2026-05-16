const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];

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
    fetch: async () => ({ json: async () => ({ market_data: { current_price: { usd: 100000 }, price_change_percentage_24h: 0 } }) }),
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
({
  activeAth: ACTIVE_ATH,
  btcAth: BTC_DATA._ath,
  yearTriggers: year.stratTriggers,
  manualTriggers,
  yearDcaInv: year.dcaInv,
  manualDcaInv,
  janMonthly,
  janManual,
  winnerByRoiMatches,
});
`, context);

assertEqual(result.activeAth, result.btcAth, 'Initial ACTIVE_ATH should use BTC data ATH');
assertEqual(result.yearTriggers, result.manualTriggers, 'First backtest year should start at selected date');
assertEqual(result.yearDcaInv, result.manualDcaInv, 'First-year DCA should start at selected date');
assertEqual(result.janMonthly, result.janManual, 'Monthly triggers should use the current threshold');
assertEqual(result.winnerByRoiMatches, true, 'Yearly winner should be based on cumulative ROI');

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
