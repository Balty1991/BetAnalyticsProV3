// BetAnalyticsProV3 service worker - cache friendly, no forced no-store
const CACHE='ba-v3-static-20260504-refreshdeep1';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function isHttp(req){ try{ const u=new URL(req.url); return u.protocol==='http:'||u.protocol==='https:'; }catch(e){ return false; } }
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET' || !isHttp(req)) return;
  const url=new URL(req.url);
  if(url.pathname.includes('/data/') && url.pathname.endsWith('.json')){
    event.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(cached => {
      const fresh=fetch(req).then(res => { if(res && res.ok) cache.put(req,res.clone()); return res; }).catch(() => cached);
      return cached || fresh;
    })));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(cached => cached || fetch(req).then(res => { if(res && res.ok) cache.put(req,res.clone()); return res; }).catch(() => cached))));
});
