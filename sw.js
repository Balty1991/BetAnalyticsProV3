// BetAnalyticsProV3 service worker - fresh network runtime
const CACHE='ba-v3-runtime-20260505-remove-desktop-fix';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
});
