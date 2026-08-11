const TOOLS = {
  'btc-drop-history': {
    asset: 'btc',
    type: 'drop',
    threshold: 8,
    title: 'BTC单日大跌历史查询：跌8%后发生了什么 | My BTC Box',
    description: '查询BTC单日收盘下跌至少8%后，次日、7日和30日的历史表现、样本数与均值。真实UTC日线，只做历史参考。',
  },
  'btc-rise-history': {
    asset: 'btc',
    type: 'rise',
    threshold: 8,
    title: 'BTC单日大涨历史查询：涨8%后发生了什么 | My BTC Box',
    description: '查询BTC单日收盘上涨至少8%后，次日、7日和30日的历史表现、样本数与均值。真实UTC日线，不预测涨跌。',
  },
  'btc-volatility-history': {
    asset: 'btc',
    type: 'range',
    threshold: 8,
    title: 'BTC单日振幅历史查询：振幅8%后发生了什么 | My BTC Box',
    description: '查询BTC单日最高价到最低价振幅至少8%的历史日期和后续表现，公开样本数、数据范围与计算口径。',
  },
  'btc-wick-history': {
    asset: 'btc',
    type: 'wick',
    threshold: 5,
    title: 'BTC插针历史查询：最低到收盘回升5%后发生了什么 | My BTC Box',
    description: '查询BTC当日最低价到收盘价回升至少5%的历史插针样本，以及次日和7日后的历史表现。',
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
    '@type': 'WebApplication',
    name: tool.title.replace(' | My BTC Box', ''),
    url: canonical,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    description: tool.description,
    provider: { '@type': 'Organization', name: 'My BTC Box', url: 'https://www.mybtcbox.com/' },
  };
  html = replaceMeta(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  html = html.replace('</head>', `<base href="/">\n<script>window.MYBTCBOX_PRESET=${JSON.stringify({asset:tool.asset,type:tool.type,threshold:tool.threshold})};</script>\n</head>`);

  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(html, { status: 200, headers });
}
