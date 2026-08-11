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
    dailyObservationContext,
    nextDailyVisit,
    queryMatchesLatest,
    utcAddDays,
    utcDayDiff,
  };
});
