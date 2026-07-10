// VEYRA service worker - network-first with runtime cache fallback
const CACHE='veyra-runtime-20260710-v30';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({includeUncontrolled:true}).then(clients=>{
        clients.forEach(c=>c.postMessage({type:'SW_UPDATED',version:'v30'}));
      }))
  );
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  event.respondWith(
    fetch(req,{cache:'no-store'})
      .then(resp=>{
        if(resp.ok){
          const clone=resp.clone();
          caches.open(CACHE).then(c=>c.put(req,clone));
        }
        return resp;
      })
      .catch(()=>caches.match(req))
  );
});
