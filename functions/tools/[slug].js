const TOOLS = {
  'btc-drop-history': {
    asset: 'btc',
    type: 'drop',
    threshold: 8,
    title: 'BTC单日大跌历史查询：跌8%后发生了什么 | My BTC Box',
    description: '查询BTC单日收盘下跌至少8%后，次日、7日和30日的历史表现、样本数与均值。真实UTC日线，只做历史参考。',
    heading: 'BTC 单日大跌历史查询如何计算',
    intro: '筛选 BTC 当日收盘价相对前一日收盘价下跌至少 8% 的完整 UTC 日线，并列出真实发生日期。',
    method: '事件跌幅 = 当日收盘价 / 前日收盘价 - 1。后续 1 日、7 日和 30 日收益都以事件日收盘价为起点，仅统计存在对应未来收盘价的样本。',
  },
  'btc-rise-history': {
    asset: 'btc',
    type: 'rise',
    threshold: 8,
    title: 'BTC单日大涨历史查询：涨8%后发生了什么 | My BTC Box',
    description: '查询BTC单日收盘上涨至少8%后，次日、7日和30日的历史表现、样本数与均值。真实UTC日线，不预测涨跌。',
    heading: 'BTC 单日大涨历史查询如何计算',
    intro: '筛选 BTC 当日收盘价相对前一日收盘价上涨至少 8% 的完整 UTC 日线，用历史样本观察大涨后的不同结果。',
    method: '事件涨幅 = 当日收盘价 / 前日收盘价 - 1。上涨比例与平均收益分别计算，并公开每个未来周期实际可用的样本数。',
  },
  'btc-volatility-history': {
    asset: 'btc',
    type: 'range',
    threshold: 8,
    title: 'BTC单日振幅历史查询：振幅8%后发生了什么 | My BTC Box',
    description: '查询BTC单日最高价到最低价振幅至少8%的历史日期和后续表现，公开样本数、数据范围与计算口径。',
    heading: 'BTC 单日振幅历史查询如何计算',
    intro: '筛选 BTC 当日最高价与最低价之间振幅至少 8% 的完整 UTC 日线，观察高波动日之后的历史分布。',
    method: '日内振幅 = 当日最高价 / 当日最低价 - 1。该指标描述当日价格范围，不等同于收盘涨跌幅。',
  },
  'btc-wick-history': {
    asset: 'btc',
    type: 'wick',
    threshold: 5,
    title: 'BTC插针历史查询：最低到收盘回升5%后发生了什么 | My BTC Box',
    description: '查询BTC当日最低价到收盘价回升至少5%的历史插针样本，以及次日和7日后的历史表现。',
    heading: 'BTC 插针历史查询如何计算',
    intro: '筛选 BTC 从当日最低价到收盘价回升至少 5% 的完整 UTC 日线，用统一口径识别历史下影线恢复。',
    method: '插针深度 = 当日收盘价 / 当日最低价 - 1。工具不假设用户能够买在最低点，只描述最低价到收盘价的历史距离。',
  },
  'btc-cycle-clock': {
    asset: 'btc',
    mode: 'cycle',
    title: 'BTC历史周期刻度尺：当前走了多久 | My BTC Box',
    description: '把BTC当前样本高点后的完整日线天数，与过去三轮顶部到底部和底部到高点时间进行对照。只比较历史时间，不预测见底或逃顶日期。',
    heading: 'BTC 历史周期刻度尺如何理解',
    intro: '把当前样本期最高价之后已经完成的日线天数，与过去三轮顶部到底部、低点到高点和减半到高点时间并列。',
    method: '当前起点会随样本期出现更高价格而更新。历史区间只是时间参照，不是见底倒计时、逃顶日期或涨跌预测。',
  },
  'btc-conditional-buy-backtest': {
    asset: 'btc',
    mode: 'backtest',
    start: '2020-01-01',
    drop: 5,
    amount: 100,
    title: 'BTC条件买入与定投历史回测 | My BTC Box',
    description: '比较BTC单日下跌5%时条件买入100美元与每周定投的历史投入、持币数量、收益率和最大回撤。历史回测不是投资建议。',
    heading: 'BTC 条件买入回测如何计算',
    intro: '比较 BTC 单日收盘下跌达到条件时买入，与从同一起始日期每 7 天投入固定金额的历史结果。',
    method: '普通条件买入按触发日收盘价成交，分档模式按前收盘价与各档阈值计算触发价。两种策略分别公开实际投入、持币数量、当前价值、投入收益率和组合回撤。',
  },
};

function replaceMeta(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

export async function onRequestGet(context) {
  const slug = String(context.params.slug || '');
  const tool = TOOLS[slug];
  if (!tool) return new Response('Tool not found', { status: 404 });

  const canonical = `https://www.mybtcbox.com/tools/${slug}`;
  const assetRequest = new Request(new URL('/', context.request.url), context.request);
  const assetResponse = await context.env.ASSETS.fetch(assetRequest);
  let html = await assetResponse.text();

  html = replaceMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${tool.title}</title>`);
  html = replaceMeta(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${tool.description}">`);
  html = replaceMeta(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  html = replaceMeta(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${tool.title}">`);
  html = replaceMeta(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${tool.description}">`);
  html = replaceMeta(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
  html = replaceMeta(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${tool.title}">`);
  html = replaceMeta(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${tool.description}">`);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: tool.title.replace(' | My BTC Box', ''),
        url: canonical,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        isAccessibleForFree: true,
        description: tool.description,
        provider: { '@type': 'Organization', name: 'My BTC Box', url: 'https://www.mybtcbox.com/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'My BTC Box', item: 'https://www.mybtcbox.com/' },
          { '@type': 'ListItem', position: 2, name: '工具目录', item: 'https://www.mybtcbox.com/tools/' },
          { '@type': 'ListItem', position: 3, name: tool.title.replace(' | My BTC Box', ''), item: canonical },
        ],
      },
    ],
  };
  html = replaceMeta(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  const preset = Object.fromEntries(['asset','type','threshold','mode','start','drop','amount']
    .filter(key => tool[key] !== undefined)
    .map(key => [key,tool[key]]));
  html = html.replace('</head>', `<base href="/">\n<script>window.MYBTCBOX_PRESET=${JSON.stringify(preset)};</script>\n</head>`);
  const explainer = `<section class="route-explainer" aria-labelledby="route-explainer-title">
    <a href="/tools/">全部 BTC 数据工具</a>
    <h2 id="route-explainer-title">${tool.heading}</h2>
    <p>${tool.intro}</p>
    <p><strong>计算口径：</strong>${tool.method}</p>
    <p class="route-source">数据：Yahoo Finance BTC-USD UTC 日线。历史样本不代表未来，不构成投资建议。</p>
  </section>`;
  html = html.replace('<div class="dscard">', `${explainer}\n<div class="dscard">`);

  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(html, { status: 200, headers });
}
