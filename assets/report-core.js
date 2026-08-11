(function initReportCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MYBTCBOX_REPORT = api;
})(typeof window !== 'undefined' ? window : globalThis, function createReportCore() {
  function average(values) {
    const valid = (values || []).filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  function maxBy(items, selector) {
    return (items || []).reduce((best, item) => !best || selector(item) > selector(best) ? item : best, null);
  }

  function minBy(items, selector) {
    return (items || []).reduce((best, item) => !best || selector(item) < selector(best) ? item : best, null);
  }

  function dateDiff(from, to) {
    return Math.max(0, Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000));
  }

  function extremes(rows) {
    const ath = maxBy(rows, row => Number.isFinite(row.high) ? row.high : row.close);
    const atl = minBy(rows, row => Number.isFinite(row.low) ? row.low : row.close);
    const maxRise = maxBy(rows, row => row.rise_to_high ?? row.pct);
    const maxDrop = minBy(rows, row => row.drop_to_low ?? row.pct);
    const maxRiseMetric = maxRise ? (maxRise.rise_to_high ?? maxRise.pct) : null;
    const maxDropMetric = maxDrop ? (maxDrop.drop_to_low ?? maxDrop.pct) : null;
    const first = rows[0];
    const latest = rows[rows.length - 1];
    const totalReturn = first && latest ? (latest.close / first.close - 1) * 100 : null;
    const avgDaily = average(rows.map(row => row.pct));
    const avgVol = average(rows.map(row => row.pct == null ? null : Math.abs(row.pct)));
    const fromAth = ath && latest ? (latest.close / (ath.high || ath.close) - 1) * 100 : null;
    return { ath, atl, maxRise, maxDrop, maxRiseMetric, maxDropMetric, first, latest, totalReturn, avgDaily, avgVol, fromAth };
  }

  function buckets(rows) {
    const moves = rows.filter(row => Number.isFinite(row.pct));
    const definitions = [
      ['> +10%', row => row.pct > 10, '#10b981'],
      ['+5% ~ +10%', row => row.pct > 5 && row.pct <= 10, '#10b981'],
      ['+3% ~ +5%', row => row.pct > 3 && row.pct <= 5, '#22c55e'],
      ['-3% ~ +3%', row => row.pct >= -3 && row.pct <= 3, '#94a3b8'],
      ['-3% ~ -5%', row => row.pct < -3 && row.pct >= -5, '#f97316'],
      ['-5% ~ -10%', row => row.pct < -5 && row.pct >= -10, '#ef4444'],
      ['< -10%', row => row.pct < -10, '#ef4444'],
    ];
    return definitions.map(([label, test, color]) => {
      const count = moves.filter(test).length;
      return { label, count, pct: moves.length ? count / moves.length * 100 : 0, color };
    });
  }

  function streaks(rows) {
    const up = [];
    const down = [];
    let direction = 0;
    let length = 0;
    const flush = () => {
      if (length > 1) {
        if (direction > 0) up.push(length);
        if (direction < 0) down.push(length);
      }
    };
    rows.filter(row => Number.isFinite(row.pct)).forEach(row => {
      const nextDirection = row.pct > 0 ? 1 : row.pct < 0 ? -1 : 0;
      if (!nextDirection) {
        flush();
        direction = 0;
        length = 0;
      } else if (nextDirection === direction) length += 1;
      else {
        flush();
        direction = nextDirection;
        length = 1;
      }
    });
    flush();
    const group = values => ({
      d2: values.filter(value => value === 2).length,
      d3: values.filter(value => value === 3).length,
      d4: values.filter(value => value === 4).length,
      d57: values.filter(value => value >= 5 && value <= 7).length,
      d8: values.filter(value => value > 7).length,
    });
    return {
      maxUp: up.length ? Math.max(...up) : 0,
      maxDown: down.length ? Math.max(...down) : 0,
      avgUp: average(up) || 0,
      avgDown: average(down) || 0,
      upBucket: group(up),
      downBucket: group(down),
    };
  }

  function yearly(rows) {
    const byYear = {};
    rows.forEach(row => {
      const year = row.date.slice(0, 4);
      (byYear[year] ||= []).push(row);
    });
    const years = Object.keys(byYear).sort();
    const latestYear = rows[rows.length - 1]?.date.slice(0, 4);
    return years.map(year => {
      const entries = byYear[year];
      const first = entries[0];
      const last = entries[entries.length - 1];
      const firstIndex = rows.indexOf(first);
      const prior = firstIndex > 0 ? rows[firstIndex - 1] : null;
      const base = prior || first;
      return {
        year,
        label: year + (year === latestYear ? ' YTD' : ''),
        start: base.close,
        end: last.close,
        ret: (last.close / base.close - 1) * 100,
        vol: average(entries.map(row => row.pct == null ? null : Math.abs(row.pct))),
        up: entries.filter(row => row.pct > 0).length,
        down: entries.filter(row => row.pct < 0).length,
        flat: entries.filter(row => row.pct === 0).length,
        partial: !prior,
      };
    });
  }

  function drawdowns(rows) {
    if (!rows.length) return { worst: null, count20: 0, avgDays: null, top: [] };
    let peak = rows[0];
    let active = null;
    const periods = [];
    rows.forEach(row => {
      if (row.close >= peak.close) {
        if (active) {
          active.endDate = row.date;
          periods.push(active);
          active = null;
        }
        peak = row;
        return;
      }
      const drawdown = (row.close / peak.close - 1) * 100;
      if (drawdown <= -20 + 1e-9 && !active) active = { peakDate: peak.date, peakPrice: peak.close, bottomDate: row.date, bottomPrice: row.close, dd: drawdown };
      if (active && drawdown < active.dd) {
        active.bottomDate = row.date;
        active.bottomPrice = row.close;
        active.dd = drawdown;
      }
    });
    if (active) periods.push(active);
    periods.forEach(period => { period.days = dateDiff(period.peakDate, period.bottomDate); });
    const ordered = [...periods].sort((a, b) => a.dd - b.dd);
    return {
      worst: ordered[0] || null,
      count20: periods.length,
      avgDays: periods.length ? average(periods.map(period => period.days)) : null,
      top: ordered.slice(0, 4),
    };
  }

  function seasonality(rows) {
    const periods = {};
    rows.forEach(row => { (periods[row.date.slice(0, 7)] ||= []).push(row); });
    const monthly = Object.values(periods).map(entries => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const firstIndex = rows.indexOf(first);
      const prior = firstIndex > 0 ? rows[firstIndex - 1] : null;
      const base = prior || first;
      return { month: Number(first.date.slice(5, 7)), ret: (last.close / base.close - 1) * 100, partial: !prior };
    });
    return Array.from({ length: 12 }, (_, index) => {
      const samples = monthly.filter(month => month.month === index + 1 && !month.partial);
      return {
        month: index + 1,
        avg: average(samples.map(month => month.ret)),
        up: samples.length ? samples.filter(month => month.ret > 0).length / samples.length * 100 : null,
        count: samples.length,
      };
    });
  }

  return { average, buckets, dateDiff, drawdowns, extremes, maxBy, minBy, seasonality, streaks, yearly };
});
