// BetAnalyticsProV3 — force fresh Meciuri v24 restore, no cached UI
const CACHE='ba-v3-meciuri-v24-restore-20260503-2';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(key=>caches.delete(key)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
    try{const url=new URL(client.url);url.searchParams.set('meciuriV24','2');client.navigate(url.toString())}catch(e){}
  }
})())});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  event.respondWith(fetch(req,{cache:'reload'}).catch(()=>caches.match(req)));
});
