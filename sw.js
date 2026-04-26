// BetAnalyticsProV3 service worker - runtime cache only
const CACHE='ba-v3-runtime-20260426-yday-index';
const DATA=/\/data\/[^?#]+\.json(?:[?#].*)?$/;
const PRECACHE=['./','./index.html','./manifest.json','./assets/app.css','./assets/app.js','./assets/performance-patch.js','./assets/api_history_label_runtime.js','./data/meta.json','./data/events.json','./data/predictions.json','./data/leagues.json','./data/teams.json','./data/ai_memory.json','./data/backtest.json','./data/history_engine.json','./data/recommendation_log.json','./data/signal_audit.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(PRECACHE.map(u=>c.add(new Request(u,{cache:'reload'}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function save(req,res){try{if(res&&res.ok){let c=await caches.open(CACHE);await c.put(req,res.clone())}}catch(e){}return res}
async function netFirst(req){try{return await save(req,await fetch(req))}catch(e){let c=await caches.match(req);if(c)return c;throw e}}
async function dataFast(req){let c=await caches.open(CACHE);let cached=c.match(req);let net=fetch(req).then(r=>save(req,r)).catch(()=>null);let fast=await Promise.race([net,new Promise(r=>setTimeout(async()=>r(await cached),900))]);if(fast)return fast;let old=await cached;if(old)return old;let late=await net;if(late)return late;return fetch(req)}
async function cacheFirst(req){let c=await caches.match(req);if(c)return c;return save(req,await fetch(req))}
self.addEventListener('fetch',e=>{let r=e.request;if(r.method!=='GET')return;let u;try{u=new URL(r.url)}catch(_){return}if(u.origin!==location.origin)return;if(r.mode==='navigate'){e.respondWith(netFirst(r));return}if(DATA.test(u.pathname)){e.respondWith(dataFast(r));return}e.respondWith(cacheFirst(r))});
