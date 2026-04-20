(()=>{
const W=window;
const arr=v=>Array.isArray(v)?v:[];
const norm=s=>String(s||'').toLowerCase().trim();
const num=s=>{const m=String(s||'').match(/-?\d+(?:\.\d+)?/g);return m&&m.length?Number(m[m.length-1]):0;};
let skipped=[];

async function loadSkipped(){
  const paths=['./data/api_events_history_skipped_no_data.json','data/api_events_history_skipped_no_data.json','/BetAnalyticsProV3/data/api_events_history_skipped_no_data.json'];
  for(const p of paths){
    try{
      const r=await fetch(p+'?v=20260420hotfix2',{cache:'no-store'});
      if(r.ok){ skipped=arr(await r.json()); return; }
    }catch(e){}
  }
  const summaryPaths=['./data/api_events_history_summary.json','data/api_events_history_summary.json','/BetAnalyticsProV3/data/api_events_history_summary.json'];
  for(const p of summaryPaths){
    try{
      const r=await fetch(p+'?v=20260420hotfix2',{cache:'no-store'});
      if(r.ok){
        const json=await r.json();
        skipped=arr(json && json.skipped_no_data_preview);
        return;
      }
    }catch(e){}
  }
}

function isSkippedText(text){
  const t=norm(text);
  return skipped.some(x=>t.includes(norm(x.league)) && t.includes(norm(x.season_name)));
}

function run(){
  const tab=document.getElementById('tab-apihistory');
  if(!tab) return;

  tab.querySelectorAll('table tbody').forEach(tbody=>{
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      const tds=tr.querySelectorAll('td');
      if(tds.length<6) return;
      const events=num(tds[4]&&tds[4].textContent);
      const sample=num(tds[5]&&tds[5].textContent);
      if(events<=0 || sample<=0) tr.remove();
    });
  });

  if(skipped.length){
    [...tab.querySelectorAll('div')].forEach(el=>{
      const style=String(el.getAttribute('style')||'');
      if(style.indexOf('245,158,11')===-1) return;
      if(isSkippedText(el.textContent||'')) el.remove();
    });
  }
}

function boot(){
  loadSkipped().finally(()=>{
    run();
    if(typeof W.switchTab==='function'&&!W.__fhHotfixSwitch){
      const old=W.switchTab;
      W.switchTab=function(name){
        const out=old.apply(this,arguments);
        setTimeout(run,0);
        setTimeout(run,300);
        setTimeout(run,900);
        return out;
      };
      W.__fhHotfixSwitch=1;
    }
    if(typeof W.doRefresh==='function'&&!W.__fhHotfixRefresh){
      const old=W.doRefresh;
      W.doRefresh=async function(){
        const out=await old.apply(this,arguments);
        setTimeout(run,0);
        setTimeout(run,400);
        setTimeout(run,1000);
        return out;
      };
      W.__fhHotfixRefresh=1;
    }
    const mo=new MutationObserver(()=>run());
    mo.observe(document.body,{childList:true,subtree:true});
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
