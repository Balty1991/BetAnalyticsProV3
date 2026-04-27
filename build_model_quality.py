#!/usr/bin/env python3
"""Builds data/model_quality.json for the BetAnalytics Pro command center."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from analytics_core import quality_grade, safe_float

DATA_DIR=Path('data')

def load_json(path:Path, default:Any)->Any:
    try:
        with path.open(encoding='utf-8') as f: return json.load(f)
    except Exception:
        return default

def save_json(path:Path, payload:Any)->None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w',encoding='utf-8') as f:
        json.dump(payload,f,ensure_ascii=False,indent=2); f.write('\n')

def as_list(payload:Any)->List[Dict[str,Any]]:
    if isinstance(payload,list): return [x for x in payload if isinstance(x,dict)]
    if isinstance(payload,dict):
        for k in ('results','predictions','events','signals','rows','data'):
            v=payload.get(k)
            if isinstance(v,list): return [x for x in v if isinstance(x,dict)]
    return []

def iso_age_hours(iso:Any)->Optional[float]:
    if not iso: return None
    try:
        dt=datetime.fromisoformat(str(iso).replace('Z','+00:00'))
        if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc)-dt.astimezone(timezone.utc)).total_seconds()/3600.0
    except Exception:
        return None

def freshness_score(age:Optional[float], warn:float=6.0, bad:float=24.0)->float:
    if age is None: return 45.0
    if age<=warn: return 100.0
    if age>=bad: return 35.0
    return 100.0-((age-warn)/(bad-warn))*65.0

def market_quality_from_pack(pack:Dict[str,Any])->List[Dict[str,Any]]:
    out=[]; markets=pack.get('markets',{}) if isinstance(pack,dict) else {}
    if not isinstance(markets,dict): return out
    for market,row in sorted(markets.items()):
        if not isinstance(row,dict): continue
        auc=safe_float(row.get('wfv_avg_auc',row.get('test_auc',0.0)),0.0)
        ece=safe_float(row.get('test_ece',row.get('avg_ece',1.0)),1.0)
        brier=safe_float(row.get('test_brier',row.get('avg_brier',1.0)),1.0)
        n_train=int(safe_float(row.get('n_train',0),0))
        score=0.0
        if auc>0: score+=min(42.0,max(0.0,(auc-0.50)/0.20*42.0))
        score+=max(0.0,30.0*(1.0-min(ece,0.14)/0.14))
        score+=max(0.0,18.0*(1.0-min(brier,0.34)/0.34))
        score+=min(10.0,n_train/400.0)
        score=max(0.0,min(100.0,score))
        out.append({'market':market,'auc':round(auc,4) if auc else None,'ece':round(ece,4) if ece!=1.0 else None,'brier':round(brier,4) if brier!=1.0 else None,'n_train':n_train,'score':round(score,1),'grade':quality_grade(score)})
    return out

def recommendations(payload:Dict[str,Any])->List[str]:
    rec=[]
    if payload['coverage'].get('predictions',0)==0: rec.append('Nu există predicții încărcate. Verifică fetch_data.py și BSD_TOKEN.')
    if payload['coverage'].get('ev_signals',0)==0: rec.append('Nu există semnale EV+. Verifică predict_current.py, modelele CatBoost și pragurile de edge.')
    if not payload.get('markets'): rec.append('model_pack_v2.json lipsește sau nu conține piețe. Rulează workflow-ul SmartBet v2 Full Pipeline.')
    weak=[m['market'] for m in payload.get('markets',[]) if safe_float(m.get('score'),0)<60]
    if weak: rec.append('Reantrenează sau calibrează piețele slabe: '+', '.join(weak[:5])+'.')
    age=payload['freshness'].get('meta_age_hours')
    if age and age>24: rec.append('Datele par vechi peste 24h. Verifică scheduler-ul GitHub Actions și rate-limit-ul API.')
    if not rec: rec.append('Pipeline-ul este operațional. Următorul pas: backtesting ROI pe ligă și calibrare separată per piață.')
    return rec[:6]

def main()->None:
    predictions=as_list(load_json(DATA_DIR/'predictions.json',[]))
    meta=load_json(DATA_DIR/'meta.json',{})
    ev=as_list(load_json(DATA_DIR/'ev_signals_v2.json',{}))
    pack=load_json(DATA_DIR/'model_pack_v2.json',{})
    backtest=load_json(DATA_DIR/'backtest.json',{})
    training=load_json(DATA_DIR/'training_scoring_summary.json',{})
    generated_at=meta.get('generated_at') or meta.get('updated_at') or meta.get('last_update') if isinstance(meta,dict) else None
    age=iso_age_hours(generated_at); markets=market_quality_from_pack(pack if isinstance(pack,dict) else {})
    market_score=sum(safe_float(m.get('score'),0) for m in markets)/len(markets) if markets else 45.0
    fresh= freshness_score(age); ev_score=min(100.0,45.0+len(ev)*6.0); pred_score=min(100.0,30.0+len(predictions)*0.8) if predictions else 35.0
    total=round(0.38*market_score+0.28*fresh+0.20*ev_score+0.14*pred_score,1)
    top=sorted(ev,key=lambda x:(safe_float(x.get('score'),0),safe_float(x.get('edge_pp'),0),safe_float(x.get('ev_pct'),0)),reverse=True)[:8]
    payload={'updated_at':datetime.now(timezone.utc).isoformat(),'quality_score':total,'quality_grade':quality_grade(total),'coverage':{'predictions':len(predictions),'ev_signals':len(ev),'markets':len(markets),'backtest_keys':len(backtest) if isinstance(backtest,dict) else 0,'training_summary_keys':len(training) if isinstance(training,dict) else 0},'freshness':{'meta_generated_at':generated_at,'meta_age_hours':round(age,2) if age is not None else None,'score':round(fresh,1)},'markets':markets,'top_ev_signals':top,'ui_cards':[{'label':'Scor produs','value':total,'suffix':'/100','tone':'good' if total>=72 else ('warn' if total>=55 else 'bad')},{'label':'Predicții','value':len(predictions),'suffix':' active','tone':'good' if predictions else 'bad'},{'label':'Semnale EV+','value':len(ev),'suffix':' găsite','tone':'good' if ev else 'warn'},{'label':'Piețe model','value':len(markets),'suffix':' auditate','tone':'good' if len(markets)>=5 else 'warn'}]}
    payload['recommendations']=recommendations(payload)
    save_json(DATA_DIR/'model_quality.json',payload)
    print(f"Salvat data/model_quality.json — scor {total}/100, {len(markets)} piețe, {len(ev)} semnale EV+.")

if __name__=='__main__': main()
