(function renderPublishedStatus(){
  const manifest=window.CRYPTO_DATA_HEALTH;
  const summary=document.getElementById('status-summary');
  const list=document.getElementById('asset-list');
  const expected=['BTC','ETH','SOL','DOGE','BNB'];
  const today=new Date().toISOString().slice(0,10);
  const dayDiff=(from,to)=>Math.max(0,Math.floor((new Date(`${to}T00:00:00Z`)-new Date(`${from}T00:00:00Z`))/86400000));
  const dateTime=value=>{
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'UTC',hour12:false})+' UTC':'未知';
  };
  const fail=message=>{
    summary.className='status-summary error';
    summary.setAttribute('aria-busy','false');
    document.getElementById('overall-status').textContent='状态读取失败';
    document.getElementById('overall-detail').textContent=message;
    list.innerHTML='<div class="asset-row placeholder"><span>无法显示资产明细</span><span>请稍后刷新</span></div>';
  };
  if(!manifest||!Array.isArray(manifest.assets)){fail('公开健康清单未加载。历史工具可能仍可使用，请先核对数据截止日期。');return;}

  const byCoin=new Map(manifest.assets.map(asset=>[asset.coin,asset]));
  const rows=expected.map(coin=>{
    const asset=byCoin.get(coin);
    if(!asset)return{coin,status:'degraded',reason:'清单缺少该资产'};
    const lag=dayDiff(asset.data_through,today);
    const validHash=/^[a-f0-9]{64}$/i.test(asset.sha256||'');
    const healthy=asset.status==='healthy'&&lag<=2&&validHash&&Number(asset.rows)>=365;
    return{...asset,coin,lag,status:healthy?'healthy':'degraded',reason:healthy?'正常':lag>2?`延迟 ${lag} 天`:!validHash?'校验信息异常':'清单状态异常'};
  });
  const healthyCount=rows.filter(row=>row.status==='healthy').length;
  const allHealthy=healthyCount===expected.length&&manifest.status==='healthy';
  const throughDates=[...new Set(rows.map(row=>row.data_through).filter(Boolean))];

  summary.className=`status-summary ${allHealthy?'healthy':'degraded'}`;
  summary.setAttribute('aria-busy','false');
  document.getElementById('overall-status').textContent=allHealthy?'数据正常':'需要留意';
  document.getElementById('overall-detail').textContent=allHealthy?'五种资产均在允许延迟范围内，完整性字段正常。':'至少一种资产延迟、缺失或完整性信息异常。请查看下方明细。';
  document.getElementById('healthy-count').textContent=`${healthyCount} / ${expected.length}`;
  document.getElementById('data-through').textContent=throughDates.length===1?throughDates[0]:'日期不一致';
  document.getElementById('generated-at').textContent=dateTime(manifest.generated_at);
  list.innerHTML=rows.map(row=>`<div class="asset-row">
    <div class="asset-name"><strong>${row.coin}</strong><span>${row.symbol||'清单缺失'}</span></div>
    <div class="asset-meta">最新完整日线<br><span class="asset-value">${row.data_through||'未知'}</span></div>
    <div class="asset-meta">样本数<br><span class="asset-value">${Number.isFinite(Number(row.rows))?Number(row.rows).toLocaleString('en-US'):'-'}</span></div>
    <div class="asset-state ${row.status}">${row.reason}</div>
  </div>`).join('');
})();
