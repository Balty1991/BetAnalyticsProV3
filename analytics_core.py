#!/usr/bin/env python3
"""Statistical core for BetAnalytics Pro: no-vig, EV, Kelly, calibration, Poisson and ELO."""
from __future__ import annotations
from dataclasses import dataclass, field
from math import exp, factorial, log
from typing import Any, Dict, List, Mapping, MutableMapping, Optional, Sequence

EPS=1e-12

def safe_float(v:Any, default:float=0.0)->float:
    try:
        if v is None or v=='': return default
        x=float(v)
        return default if x!=x else x
    except Exception:
        return default

def clamp(v:float, lo:float, hi:float)->float:
    return max(lo,min(hi,v))

def decimal_to_implied_probability(odds:Any)->Optional[float]:
    o=safe_float(odds,0.0)
    return None if o<=1.01 else 1.0/o

def normalize_no_vig(odds:Sequence[Any], min_valid:int=2)->List[Optional[float]]:
    implied=[decimal_to_implied_probability(o) for o in odds]
    valid=[p for p in implied if p is not None and p>0]
    if len(valid)<min_valid: return [None for _ in odds]
    margin=sum(valid)
    if margin<=EPS: return [None for _ in odds]
    return [None if p is None else p/margin for p in implied]

def expected_value_decimal(probability:Any, odds:Any)->Optional[float]:
    p=clamp(safe_float(probability,-1.0),0.0,1.0); o=safe_float(odds,0.0)
    if p<0 or o<=1.01: return None
    return p*(o-1.0)-(1.0-p)

def kelly_fraction(probability:Any, odds:Any, fraction:float=0.25, cap:float=0.08)->float:
    p=clamp(safe_float(probability,0.0),0.0,1.0); o=safe_float(odds,0.0)
    if p<=0 or o<=1.01: return 0.0
    b=o-1.0; raw=(p*b-(1.0-p))/b
    return round(clamp(raw*safe_float(fraction,0.25),0.0,cap),6)

def brier_binary(y_true:Sequence[Any], y_prob:Sequence[Any])->Optional[float]:
    pairs=[(safe_float(y),clamp(safe_float(p),0.0,1.0)) for y,p in zip(y_true,y_prob)]
    return None if not pairs else sum((p-y)**2 for y,p in pairs)/len(pairs)

def log_loss_binary(y_true:Sequence[Any], y_prob:Sequence[Any])->Optional[float]:
    pairs=[(safe_float(y),clamp(safe_float(p),EPS,1.0-EPS)) for y,p in zip(y_true,y_prob)]
    return None if not pairs else -sum(y*log(p)+(1-y)*log(1-p) for y,p in pairs)/len(pairs)

def calibration_bins(y_true:Sequence[Any], y_prob:Sequence[Any], bins:int=10)->List[Dict[str,float]]:
    pairs=[(safe_float(y),clamp(safe_float(p),0.0,1.0)) for y,p in zip(y_true,y_prob)]
    out=[]; bins=max(2,int(bins))
    if not pairs: return out
    for i in range(bins):
        lo=i/bins; hi=(i+1)/bins
        bucket=[(y,p) for y,p in pairs if p>=lo and (p<hi or i==bins-1)]
        if not bucket:
            out.append({'bin':i+1,'lo':round(lo,4),'hi':round(hi,4),'n':0,'predicted':0.0,'actual':0.0,'gap':0.0}); continue
        pred=sum(p for _,p in bucket)/len(bucket); actual=sum(y for y,_ in bucket)/len(bucket)
        out.append({'bin':i+1,'lo':round(lo,4),'hi':round(hi,4),'n':len(bucket),'predicted':round(pred,6),'actual':round(actual,6),'gap':round(pred-actual,6)})
    return out

def expected_calibration_error(y_true:Sequence[Any], y_prob:Sequence[Any], bins:int=10, min_bin_size:int=1)->Optional[float]:
    pairs=list(zip(y_true,y_prob))
    if not pairs: return None
    total=len(pairs); ece=0.0
    for row in calibration_bins(y_true,y_prob,bins):
        n=int(row.get('n',0))
        if n>=min_bin_size: ece+=abs(row['gap'])*n/total
    return ece

def poisson_pmf(lam:Any, goals:int)->float:
    lam=clamp(safe_float(lam,0.0),0.0,10.0); goals=max(0,int(goals))
    return exp(-lam)*(lam**goals)/factorial(goals)

def dixon_coles_tau(h:int,a:int,lh:float,la:float,rho:float=-0.08)->float:
    lh=clamp(lh,0.05,10.0); la=clamp(la,0.05,10.0); r=clamp(rho,-0.30,0.30)
    if h==0 and a==0: return max(0.01,1-lh*la*r)
    if h==0 and a==1: return max(0.01,1+lh*r)
    if h==1 and a==0: return max(0.01,1+la*r)
    if h==1 and a==1: return max(0.01,1-r)
    return 1.0

def football_score_matrix(lambda_home:Any, lambda_away:Any, max_goals:int=8, rho:Optional[float]=-0.08)->List[List[float]]:
    lh=clamp(safe_float(lambda_home,1.35),0.05,6.0); la=clamp(safe_float(lambda_away,1.05),0.05,6.0); max_goals=max(3,int(max_goals))
    matrix=[]; total=0.0
    for h in range(max_goals+1):
        row=[]
        for a in range(max_goals+1):
            p=poisson_pmf(lh,h)*poisson_pmf(la,a)
            if rho is not None: p*=dixon_coles_tau(h,a,lh,la,rho)
            row.append(p); total+=p
        matrix.append(row)
    if total>EPS: matrix=[[p/total for p in row] for row in matrix]
    return matrix

def poisson_market_probabilities(lambda_home:Any, lambda_away:Any, max_goals:int=8, rho:Optional[float]=-0.08)->Dict[str,Any]:
    m=football_score_matrix(lambda_home,lambda_away,max_goals,rho); home=draw=away=btts=o15=o25=o35=0.0; best=('0-0',-1.0); scores=[]
    for h,row in enumerate(m):
        for a,p in enumerate(row):
            if h>a: home+=p
            elif h==a: draw+=p
            else: away+=p
            if h>0 and a>0: btts+=p
            if h+a>1.5: o15+=p
            if h+a>2.5: o25+=p
            if h+a>3.5: o35+=p
            if p>best[1]: best=(f'{h}-{a}',p)
            scores.append({'score':f'{h}-{a}','prob':p})
    scores.sort(key=lambda x:x['prob'], reverse=True)
    return {'home_win':round(home,6),'draw':round(draw,6),'away_win':round(away,6),'over15':round(o15,6),'under15':round(1-o15,6),'over25':round(o25,6),'under25':round(1-o25,6),'over35':round(o35,6),'under35':round(1-o35,6),'btts':round(btts,6),'no_btts':round(1-btts,6),'most_likely_score':best[0],'most_likely_score_prob':round(best[1],6),'top_correct_scores':[{'score':x['score'],'prob':round(x['prob'],6)} for x in scores[:8]]}

@dataclass
class EloConfig:
    start_rating:float=1500.0; k_factor:float=26.0; home_advantage:float=55.0; draw_value:float=0.5; goal_diff_multiplier:bool=True

@dataclass
class EloRatings:
    config:EloConfig=field(default_factory=EloConfig); ratings:MutableMapping[str,float]=field(default_factory=dict)
    def rating(self,team_id:Any)->float:
        k=str(team_id)
        if k not in self.ratings: self.ratings[k]=float(self.config.start_rating)
        return self.ratings[k]
    def expected_home(self,home_id:Any,away_id:Any)->float:
        return 1.0/(1.0+10**((self.rating(away_id)-(self.rating(home_id)+self.config.home_advantage))/400.0))
    def update(self,home_id:Any,away_id:Any,home_goals:Any,away_goals:Any)->Dict[str,float]:
        hp=self.rating(home_id); ap=self.rating(away_id); hg=safe_float(home_goals); ag=safe_float(away_goals); exp_home=self.expected_home(home_id,away_id)
        actual=1.0 if hg>ag else (0.0 if hg<ag else self.config.draw_value); gd=abs(hg-ag); mult=1.0+(max(0.0,gd-1.0)*0.35 if self.config.goal_diff_multiplier else 0.0); mult=min(2.2,mult)
        delta=self.config.k_factor*mult*(actual-exp_home); self.ratings[str(home_id)]=hp+delta; self.ratings[str(away_id)]=ap-delta
        return {'home_pre':round(hp,4),'away_pre':round(ap,4),'expected_home':round(exp_home,6),'delta_home':round(delta,4),'home_post':round(hp+delta,4),'away_post':round(ap-delta,4)}

def blend_probabilities(probabilities:Mapping[str,Any], weights:Mapping[str,Any], default:Optional[float]=None)->Optional[float]:
    num=den=0.0
    for k,v in probabilities.items():
        p=safe_float(v,-1.0); w=max(0.0,safe_float(weights.get(k),0.0))
        if 0<=p<=1 and w>0: num+=p*w; den+=w
    return default if den<=EPS else clamp(num/den,0.0,1.0)

def quality_grade(score:Any)->str:
    s=safe_float(score,0.0)
    return 'A' if s>=85 else ('B' if s>=72 else ('C' if s>=60 else ('D' if s>=45 else 'E')))
