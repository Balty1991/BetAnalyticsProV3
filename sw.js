// VEYRA service worker - fresh network runtime
const CACHE='veyra-runtime-20260703-fix7';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
});
