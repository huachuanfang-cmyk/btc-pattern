(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.BtcBoxReturnBrief=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function matches(row,query){
    const threshold=Number(query?.threshold);
    if(!row||!Number.isFinite(threshold)) return false;
    if(query.type==='drop') return Number(row.pct)<=-threshold;
    if(query.type==='rise') return Number(row.pct)>=threshold;
    if(query.type==='range') return Number(row.range_pct)>=threshold;
    if(query.type==='wick') return Number(row.low_to_close)>=threshold;
    return false;
  }
  function build(previousDate,latestDate,coins,queries,maxDays=30){
    if(!previousDate||!latestDate||previousDate>=latestDate) return null;
    const all=[];
    Object.entries(coins||{}).forEach(([coin,rows])=>{
      (rows||[]).filter(row=>row.date>previousDate&&row.date<=latestDate).slice(-maxDays).forEach(row=>all.push({...row,coin}));
    });
    if(!all.length) return null;
    const dates=[...new Set(all.map(row=>row.date))].sort();
    const biggest=all.filter(row=>Number.isFinite(Number(row.pct))).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct))[0]||null;
    const conditions=(queries||[]).map((query,index)=>{
      const rows=all.filter(row=>row.coin===query.coin&&matches(row,query));
      return {index,count:rows.length,latestDate:rows.length?rows.sort((a,b)=>b.date.localeCompare(a.date))[0].date:null};
    }).filter(item=>item.count>0);
    return {from:dates[0],through:dates.at(-1),newDays:dates.length,biggest,conditions,truncated:dates.length>=maxDays};
  }
  function render(brief,options={}){
    if(!brief) return '';
    const zh=options.lang!=='en';
    const queries=options.queries||[];
    const labels=options.labels||[];
    const biggest=brief.biggest;
    const biggestCopy=biggest
      ? (zh?`${biggest.coin} ${biggest.date} 单日${biggest.pct>=0?'上涨':'下跌'} ${Math.abs(biggest.pct).toFixed(2)}%`:`${biggest.coin} ${biggest.date} ${biggest.pct>=0?'rose':'fell'} ${Math.abs(biggest.pct).toFixed(2)}%`)
      : (zh?'无有效涨跌数据':'No valid move data');
    const conditionCount=brief.conditions.reduce((sum,item)=>sum+item.count,0);
    const conditionCopy=queries.length
      ? (zh?`${queries.length} 个保存条件共触发 ${conditionCount} 次`:`${conditionCount} matches across ${queries.length} saved conditions`)
      : (zh?'尚未保存观察条件':'No saved conditions yet');
    return `<section class="return-brief" aria-label="${zh?'上次来访后的数据变化':'Changes since your last visit'}">
      <div class="return-brief-head"><div><span>${zh?'上次来访后':'Since your last visit'}</span><strong>${brief.newDays}${zh?' 根新日线':' new daily candles'}</strong></div><small>${brief.from} ${zh?'至':'to'} ${brief.through}${brief.truncated?(zh?' · 仅显示最近30根':' · latest 30 only'):''}</small></div>
      <div class="return-brief-grid"><div><span>${zh?'期间最大单日波动':'Largest daily move'}</span><b class="${biggest?(biggest.pct>=0?'up':'dn'):''}">${biggestCopy}</b></div><div><span>${zh?'我的条件':'My conditions'}</span><b>${conditionCopy}</b></div></div>
      ${brief.conditions.length?`<div class="return-brief-matches">${brief.conditions.map(item=>`<button type="button" onclick="applySavedQuery(${item.index})"><span>${labels[item.index]||''}</span><b>${zh?`${item.count} 次 · 最近 ${item.latestDate}`:`${item.count} · latest ${item.latestDate}`}</b></button>`).join('')}</div>`:''}
      <p>${zh?'只汇总已完成 UTC 日线，不预测下一步。记录仅保存在本设备。':'Completed UTC candles only. No forecast. Visit history stays on this device.'}</p>
    </section>`;
  }
  return {build,matches,render};
});
