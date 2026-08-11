(function initBacktestCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MYBTCBOX_BACKTEST = api;
})(typeof window !== 'undefined' ? window : globalThis, function createBacktestCore() {
  function addUtcDays(date, days) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function nearestDaily(rows, date) {
    return (rows || []).find(row => row.date >= date) || null;
  }

  function buyStats(rows, amount, valuationPrice) {
    const validRows = (rows || []).filter(row => Number.isFinite(row.close) && row.close > 0);
    const unitAmount = Math.max(0, Number(amount) || 0);
    const invested = validRows.length * unitAmount;
    const asset = validRows.reduce((sum, row) => sum + unitAmount / row.close, 0);
    const currentValue = asset * (Number(valuationPrice) || 0);
    return {
      count: validRows.length,
      invested,
      btc: asset,
      currentValue,
      avgBuy: asset ? invested / asset : 0,
      roi: invested ? (currentValue / invested - 1) * 100 : 0,
    };
  }

  function weeklyRows(rows, startDate, endDate) {
    const output = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      const day = nearestDaily(rows, cursor);
      if (day && day.date <= endDate && (!output.length || output[output.length - 1].date !== day.date)) output.push(day);
      cursor = addUtcDays(cursor, 7);
    }
    return output;
  }

  function tieredStats(rows, rules, valuationPrice) {
    let invested = 0;
    let asset = 0;
    let buys = 0;
    let days = 0;
    const validRules = (rules || []).filter(rule => Number(rule.threshold) > 0 && Number(rule.amount) > 0);
    for (const row of rows || []) {
      if (!row.prevClose || !row.low) continue;
      let dayBuys = 0;
      for (const rule of validRules) {
        const triggerPrice = row.prevClose * (1 - Number(rule.threshold) / 100);
        if (row.low <= triggerPrice) {
          invested += Number(rule.amount);
          asset += Number(rule.amount) / triggerPrice;
          buys += 1;
          dayBuys += 1;
        }
      }
      if (dayBuys) days += 1;
    }
    const currentValue = asset * (Number(valuationPrice) || 0);
    return {
      count: days,
      buys,
      invested,
      btc: asset,
      currentValue,
      avgBuy: asset ? invested / asset : 0,
      roi: invested ? (currentValue / invested - 1) * 100 : 0,
    };
  }

  function strategyStats(rows, options, valuationPrice) {
    return options.tiered
      ? tieredStats(rows, options.rules, valuationPrice)
      : buyStats(rows.filter(row => row.pct <= -options.threshold), options.amount, valuationPrice);
  }

  function yearlyBacktest(rows, options) {
    const output = {};
    const latest = rows[rows.length - 1];
    if (!latest) return output;
    const startYear = Math.max(Number(options.startDate.slice(0, 4)), Number(rows[0].date.slice(0, 4)));
    const endYear = Number(latest.date.slice(0, 4));
    if (startYear > endYear) return output;
    let cumulativeStrategyAsset = 0;
    let cumulativeDcaAsset = 0;
    let cumulativeStrategyInvested = 0;
    let cumulativeDcaInvested = 0;

    for (let year = startYear; year <= endYear; year += 1) {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const segmentStart = year === startYear && options.startDate > yearStart ? options.startDate : yearStart;
      const segmentEnd = latest.date < yearEnd ? latest.date : yearEnd;
      if (segmentStart > segmentEnd) continue;
      const eligible = rows.filter(row => row.date >= segmentStart && row.date <= segmentEnd && row.pct != null);
      if (!eligible.length) continue;
      const yearEndPrice = eligible[eligible.length - 1].close;
      const strategy = strategyStats(eligible, options, yearEndPrice);
      const dca = buyStats(weeklyRows(rows, segmentStart, segmentEnd), options.amount, yearEndPrice);
      cumulativeStrategyAsset += strategy.btc;
      cumulativeDcaAsset += dca.btc;
      cumulativeStrategyInvested += strategy.invested;
      cumulativeDcaInvested += dca.invested;
      const cumulativeStrategyValue = cumulativeStrategyAsset * yearEndPrice;
      const cumulativeDcaValue = cumulativeDcaAsset * yearEndPrice;
      const strategyRoi = cumulativeStrategyInvested ? (cumulativeStrategyValue / cumulativeStrategyInvested - 1) * 100 : 0;
      const dcaRoi = cumulativeDcaInvested ? (cumulativeDcaValue / cumulativeDcaInvested - 1) * 100 : 0;
      output[year] = {
        stratTriggers: strategy.count,
        stratInvested: strategy.invested,
        stratBtcAdded: strategy.btc,
        cumStratBtc: cumulativeStrategyAsset,
        cumStratInv: cumulativeStrategyInvested,
        cumStratVal: cumulativeStrategyValue,
        dcaInv: dca.invested,
        dcaBtcAdded: dca.btc,
        cumDcaBtc: cumulativeDcaAsset,
        cumDcaInv: cumulativeDcaInvested,
        cumDcaVal: cumulativeDcaValue,
        yep: yearEndPrice,
        winner: strategyRoi > dcaRoi ? 'strat' : 'dca',
        stratROI: strategyRoi,
        dcaROI: dcaRoi,
      };
    }
    return output;
  }

  function monthlyTriggers(rows, startDate, threshold) {
    const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, triggers: 0, totalInvested: 0, drops: 0 }));
    for (const row of rows.filter(item => item.date >= startDate && item.pct != null)) {
      if (row.pct <= -threshold) {
        const month = new Date(`${row.date}T00:00:00Z`).getUTCMonth();
        months[month].triggers += 1;
        months[month].drops += 1;
      }
    }
    return months;
  }

  function monthlyReturns(rows, options) {
    const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, stratReturns: [], dcaReturns: [] }));
    const latest = rows[rows.length - 1];
    if (!latest) return months.map(month => ({ month: month.month, stratAvg: null, dcaAvg: null, stratCount: 0, dcaCount: 0 }));
    const startYear = Math.max(Number(options.startDate.slice(0, 4)), Number(rows[0].date.slice(0, 4)));
    const endYear = Number(latest.date.slice(0, 4));
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const monthText = String(month).padStart(2, '0');
        const monthStart = `${year}-${monthText}-01`;
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const monthEnd = `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`;
        const segmentStart = year === startYear && options.startDate > monthStart ? options.startDate : monthStart;
        const segmentEnd = latest.date < monthEnd ? latest.date : monthEnd;
        if (segmentStart > segmentEnd) continue;
        const eligible = rows.filter(row => row.date >= segmentStart && row.date <= segmentEnd && row.pct != null);
        if (!eligible.length) continue;
        const monthEndPrice = eligible[eligible.length - 1].close;
        const strategy = strategyStats(eligible, options, monthEndPrice);
        const dca = buyStats(weeklyRows(rows, segmentStart, segmentEnd), options.amount, monthEndPrice);
        if (strategy.invested) months[month - 1].stratReturns.push((strategy.btc * monthEndPrice / strategy.invested - 1) * 100);
        if (dca.invested) months[month - 1].dcaReturns.push((dca.btc * monthEndPrice / dca.invested - 1) * 100);
      }
    }
    return months.map(month => ({
      month: month.month,
      stratAvg: month.stratReturns.length ? month.stratReturns.reduce((sum, value) => sum + value, 0) / month.stratReturns.length : null,
      dcaAvg: month.dcaReturns.length ? month.dcaReturns.reduce((sum, value) => sum + value, 0) / month.dcaReturns.length : null,
      stratCount: month.stratReturns.length,
      dcaCount: month.dcaReturns.length,
    }));
  }

  function findDrawdowns(values) {
    const valid = values.filter(value => Number.isFinite(value) && value > 0);
    if (!valid.length) return { maxDd: 0, count20: 0 };
    let peak = valid[0];
    let maxDrawdown = 0;
    let count20 = 0;
    for (const value of valid) {
      if (value >= peak) peak = value;
      else {
        const drawdown = (value / peak - 1) * 100;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
        if (drawdown <= -20 + 1e-9) count20 += 1;
      }
    }
    return { maxDd: Math.round(maxDrawdown * 100) / 100, count20 };
  }

  function backtestDrawdowns(rows, options) {
    const latest = rows[rows.length - 1];
    if (!latest) return { strat: findDrawdowns([]), dca: findDrawdowns([]) };
    const simulation = [];
    let strategyAsset = 0;
    let strategyInvested = 0;
    let dcaAsset = 0;
    let dcaInvested = 0;
    let cursor = options.startDate;
    while (cursor <= latest.date) {
      const segmentEnd = addUtcDays(cursor, 29);
      const eligible = rows.filter(row => row.date >= cursor && row.date <= segmentEnd && row.pct != null);
      if (!eligible.length) {
        cursor = addUtcDays(cursor, 30);
        continue;
      }
      const price = eligible[eligible.length - 1].close;
      const strategy = strategyStats(eligible, options, price);
      const dca = buyStats(weeklyRows(rows, cursor, segmentEnd), options.amount, price);
      strategyAsset += strategy.btc;
      strategyInvested += strategy.invested;
      dcaAsset += dca.btc;
      dcaInvested += dca.invested;
      simulation.push({
        date: segmentEnd,
        stratVal: strategyAsset * price,
        stratInv: strategyInvested,
        dcaVal: dcaAsset * price,
        dcaInv: dcaInvested,
      });
      cursor = addUtcDays(segmentEnd, 1);
    }
    return {
      strat: findDrawdowns(simulation.map(point => point.stratVal)),
      dca: findDrawdowns(simulation.map(point => point.dcaVal)),
    };
  }

  return { addUtcDays, backtestDrawdowns, buyStats, findDrawdowns, monthlyReturns, monthlyTriggers, nearestDaily, tieredStats, weeklyRows, yearlyBacktest };
});
