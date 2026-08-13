const CACHE_NAME='mybtcbox-shell-v3';
const SHELL=['/','/tools/','/methodology.html','/status.html','/manifest.webmanifest','/assets/app.css','/assets/core.js','/assets/backtest-core.js','/assets/report-core.js','/assets/app.js','/assets/tools.css','/assets/status.css','/assets/status.js','/data/health.js','/data/daily-summary.js','/app-icon.svg','/app-icon-180.png','/app-icon-192.png','/app-icon-512.png','/og-image.png'];

self.addEventListener('install',event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch',event => {
  const request=event.request;
  if(request.method !== 'GET') return;
  const url=new URL(request.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request,copy));
        }
        return response;
      })
      .catch(async () => {
        const cached=await caches.match(request);
        if(cached) return cached;
        if(request.mode === 'navigate') return caches.match('/');
        return new Response('Offline', {status:503,headers:{'Content-Type':'text/plain; charset=UTF-8'}});
      })
  );
});
