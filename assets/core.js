(function initMyBtcBoxCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MYBTCBOX_CORE = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCore() {
  function utcDayDiff(a, b) {
    if (!a || !b) return 0;
    return Math.max(0, Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000));
  }

  function utcAddDays(date, days) {
    return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
  }

  function roundNumber(value, digits = 2) {
    return value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
  }

  function roundPrice(value) {
    if (value == null || !Number.isFinite(value)) return null;
    const absolute = Math.abs(value);
    const digits = absolute >= 1000 ? 2 : absolute >= 1 ? 4 : absolute >= 0.1 ? 5 : absolute >= 0.01 ? 6 : 8;
    return roundNumber(value, digits);
  }

  function buildMarketData(source) {
    if (!source || !Array.isArray(source.daily)) throw new TypeError('Market data source must include a daily array.');
    const rows = source.daily.map(row => ({
      date: row.date,
      open: +row.open,
      high: +row.high,
      low: +row.low,
      close: +row.close,
      volume: +(row.volume || 0),
    })).filter(row => row.date && row.open && row.high && row.low && row.close)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) throw new TypeError('Market data source contains no valid OHLC rows.');

    rows.forEach((row, index) => {
      row.prev_close = index > 0 ? rows[index - 1].close : null;
      row.pct_raw = row.prev_close ? (row.close / row.prev_close - 1) * 100 : null;
      row.pct = row.pct_raw == null ? null : roundNumber(row.pct_raw, 2);
      row.close_pct = row.pct;
      row.range_pct_raw = (row.high / row.low - 1) * 100;
      row.range_pct = roundNumber(row.range_pct_raw, 2);
      row.low_to_close_raw = (row.close / row.low - 1) * 100;
      row.low_to_close = roundNumber(row.low_to_close_raw, 2);
      row.drop_to_low_raw = row.prev_close ? (row.low / row.prev_close - 1) * 100 : null;
      row.drop_to_low = row.drop_to_low_raw == null ? null : roundNumber(row.drop_to_low_raw, 2);
      row.rise_to_high_raw = row.prev_close ? (row.high / row.prev_close - 1) * 100 : null;
      row.rise_to_high = row.rise_to_high_raw == null ? null : roundNumber(row.rise_to_high_raw, 2);
      row.wick_depth = row.low_to_close;
      row.wick_depth_raw = row.low_to_close_raw;
    });

    const futureRaw = (index, days) => rows[index + days]
      ? (rows[index + days].close / rows[index].close - 1) * 100
      : null;
    const future = (index, days) => {
      const value = futureRaw(index, days);
      return value == null ? null : roundNumber(value, 2);
    };
    const base = (row, index) => ({
      date: row.date,
      open: roundPrice(row.open),
      high: roundPrice(row.high),
      low: roundPrice(row.low),
      close: roundPrice(row.close),
      pct: row.pct,
      next1: future(index, 1),
      next7: future(index, 7),
      next30: future(index, 30),
      next1_raw: futureRaw(index, 1),
      next7_raw: futureRaw(index, 7),
      next30_raw: futureRaw(index, 30),
      range_pct: row.range_pct,
      wick_depth: row.wick_depth,
      low_to_close: row.low_to_close,
      drop_to_low: row.drop_to_low,
      rise_to_high: row.rise_to_high,
      pct_raw: row.pct_raw,
      range_pct_raw: row.range_pct_raw,
      wick_depth_raw: row.wick_depth_raw,
      low_to_close_raw: row.low_to_close_raw,
      drop_to_low_raw: row.drop_to_low_raw,
      rise_to_high_raw: row.rise_to_high_raw,
      volume: Math.round(row.volume || 0),
    });
    const descending = (a, b) => b.date.localeCompare(a.date);
    const daily = rows.map(base);
    const drops = daily.filter(row => row.pct_raw != null && row.pct_raw < 0).sort(descending);
    const rises = daily.filter(row => row.pct_raw != null && row.pct_raw >= 0).sort(descending);
    const intraday = rows.map((row, index) => ({
      date: row.date,
      open: roundPrice(row.open),
      high: roundPrice(row.high),
      low: roundPrice(row.low),
      close: roundPrice(row.close),
      close_pct: row.close_pct,
      range_pct: row.range_pct,
      low_to_close: row.low_to_close,
      drop_to_low: row.drop_to_low,
      range_pct_raw: row.range_pct_raw,
      low_to_close_raw: row.low_to_close_raw,
      next1: future(index, 1),
      next7: future(index, 7),
      next30: future(index, 30),
      next1_raw: futureRaw(index, 1),
      next7_raw: futureRaw(index, 7),
      next30_raw: futureRaw(index, 30),
      volume: Math.round(row.volume || 0),
    })).filter(row => row.range_pct_raw >= 5).sort(descending);
    const wickEvents = rows.map((row, index) => ({
      date: row.date,
      low: roundPrice(row.low),
      close: roundPrice(row.close),
      wick_depth: row.wick_depth,
      range_pct: row.range_pct,
      day_pct: row.pct,
      wick_depth_raw: row.wick_depth_raw,
      low_to_close_raw: row.low_to_close_raw,
      next1: future(index, 1),
      next7: future(index, 7),
      next30: future(index, 30),
      next1_raw: futureRaw(index, 1),
      next7_raw: futureRaw(index, 7),
      next30_raw: futureRaw(index, 30),
      volume: Math.round(row.volume || 0),
    })).filter(row => row.wick_depth_raw >= 3).sort(descending);

    function summarizeSelection(selected) {
      const values = key => selected.map(event => event[`${key}_raw`] ?? event[key]).filter(Number.isFinite);
      const upPercent = key => {
        const entries = values(key);
        return entries.length ? roundNumber(entries.filter(value => value > 0).length / entries.length * 100, 1) : null;
      };
      const average = key => {
        const entries = values(key);
        return entries.length ? roundNumber(entries.reduce((sum, value) => sum + value, 0) / entries.length, 2) : null;
      };
      const median = key => {
        const entries = values(key).sort((a, b) => a - b);
        if (!entries.length) return null;
        const middle = Math.floor(entries.length / 2);
        return roundNumber(entries.length % 2 ? entries[middle] : (entries[middle - 1] + entries[middle]) / 2, 2);
      };
      const lowToClose = selected.filter(event => event.low_to_close != null);
      return {
        count: selected.length,
        n1: values('next1').length,
        n7: values('next7').length,
        n30: values('next30').length,
        up1_pct: upPercent('next1'),
        up1_avg: average('next1'),
        up7_pct: upPercent('next7'),
        up7_avg: average('next7'),
        up30_pct: upPercent('next30'),
        up30_avg: average('next30'),
        med1: median('next1'),
        med7: median('next7'),
        med30: median('next30'),
        ltc_up_pct: lowToClose.length ? roundNumber(lowToClose.filter(event => event.low_to_close > 0).length / lowToClose.length * 100, 1) : null,
        ltc_1_pct: lowToClose.length ? roundNumber(lowToClose.filter(event => (event.low_to_close_raw ?? event.low_to_close) >= 1).length / lowToClose.length * 100, 1) : null,
        ltc_avg: lowToClose.length ? roundNumber(lowToClose.reduce((sum, event) => sum + event.low_to_close, 0) / lowToClose.length, 2) : null,
      };
    }

    function summarize(events, metric, thresholds, mode) {
      const output = {};
      for (const threshold of thresholds) {
        const selected = events.filter(event => {
          const value = event[`${metric}_raw`] ?? event[metric];
          return mode === 'lte' ? value <= -threshold : value >= threshold;
        });
        output[String(threshold)] = selected.length ? summarizeSelection(selected) : null;
      }
      return output;
    }

    return {
      ...source,
      _ath: rows.reduce((highest, row) => Math.max(highest, row.high || row.close || 0), 0),
      data_through: source.data_through || rows[rows.length - 1].date,
      date_range: source.date_range || `${rows[0].date} to ${rows[rows.length - 1].date}`,
      daily,
      drops,
      rises,
      intraday,
      wick: { events: wickEvents, pre: summarize(wickEvents, 'wick_depth', [5, 8, 10, 15, 20], 'gte') },
      pre: {
        drop: summarize(daily, 'pct', [3, 5, 8, 10, 15, 20, 30], 'lte'),
        rise: summarize(daily, 'pct', [3, 5, 8, 10, 15, 20, 30], 'gte'),
        range: summarize(intraday, 'range_pct', [5, 8, 10, 15, 20, 25, 30], 'gte'),
      },
    };
  }

  function btcCycleContext(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const latest = rows[rows.length - 1];
    const peak = rows.reduce((best, row) => (row.high || row.close) > (best.high || best.close) ? row : best, rows[0]);
    const peakPrice = peak.high || peak.close;
    const daysSincePeak = utcDayDiff(peak.date, latest.date);
    const drawdown = peakPrice ? (latest.close / peakPrice - 1) * 100 : null;
    return { latest, peak, peakPrice, daysSincePeak, drawdown };
  }

  function dailyObservationContext(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const cycle = btcCycleContext(rows);
    if (!cycle || !Number.isFinite(cycle.peakPrice)) return null;
    const previous = rows[rows.length - 2];
    const previousDrawdown = (previous.close / cycle.peakPrice - 1) * 100;
    return {
      ...cycle,
      previous,
      dailyMove: Number(cycle.latest.pct),
      previousDrawdown,
      drawdownChange: cycle.drawdown - previousDrawdown,
    };
  }

  function nextDailyVisit(previousState, latestDate) {
    const previous = previousState && typeof previousState === 'object' ? previousState : {};
    const state = {
      lastDate: typeof previous.lastDate === 'string' ? previous.lastDate : null,
      streak: Math.max(0, Number(previous.streak) || 0),
      totalDays: Math.max(0, Number(previous.totalDays) || 0),
    };
    if (!latestDate || state.lastDate === latestDate) return state;
    const gap = state.lastDate ? utcDayDiff(state.lastDate, latestDate) : null;
    return {
      lastDate: latestDate,
      streak: gap === 1 ? Math.max(1, state.streak) + 1 : 1,
      totalDays: state.totalDays + 1,
    };
  }

  function queryMatchesLatest(latest, item) {
    const threshold = Number(item?.threshold);
    if (!latest || !Number.isFinite(threshold)) return false;
    if (item.type === 'drop') return Number(latest.pct) <= -threshold;
    if (item.type === 'rise') return Number(latest.pct) >= threshold;
    const range = Number.isFinite(Number(latest.range_pct))
      ? Number(latest.range_pct)
      : latest.high && latest.low ? (latest.high / latest.low - 1) * 100 : NaN;
    const wick = Number.isFinite(Number(latest.low_to_close))
      ? Number(latest.low_to_close)
      : latest.close && latest.low ? (latest.close / latest.low - 1) * 100 : NaN;
    if (item.type === 'range') return range >= threshold;
    if (item.type === 'wick') return wick >= threshold;
    return false;
  }

  return {
    btcCycleContext,
    buildMarketData,
    dailyObservationContext,
    nextDailyVisit,
    queryMatchesLatest,
    roundNumber,
    roundPrice,
    utcAddDays,
    utcDayDiff,
  };
});
