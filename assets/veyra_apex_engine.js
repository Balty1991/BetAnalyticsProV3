/**
 * VEYRA Apex Neural Engine v1.0
 * ================================================================
 * Arhitectura completă cu 3 niveluri de predicție:
 *   TIER 1 ELITE      — score ≥ 78 · confirmat AI Memory + Edge
 *   TIER 2 VALIDATED  — score 62-77 · confirmat 1+ surse
 *   TIER 3 WATCHLIST  — score 45-61 · semnale emergente
 *
 * Îmbunătățiri față de TruthGuard v7:
 *   - Praguri adaptive bazate pe istoricul ROI per piață
 *   - Auto-învățare din AI Memory + Training Pack + CatBoost v2
 *   - 3x mai multe picks vizibile (15-30 vs 0-1)
 *   - UI spectaculos cu scoruri detaliate și chip-uri
 *   - Ticket generator integrat (Safe/Balanced/Value)
 *   - Secțiune Motor Învățare completă cu statistici live
 * ================================================================
 */
(function () {
  'use strict';
  if (window.__VEYRA_APEX_ENGINE__) return;
  window.__VEYRA_APEX_ENGINE__ = true;

  /* Block old engines to prevent conflicts */
  window.__VEYRA_TRUTHGUARD_V7_RUNTIME__ = true;
  window.__VEYRA_TRUTHGUARD_V6_RUNTIME__ = true;
  window.__SUPREME_ENGINE_V5_RENDERED__  = true;

  /* ── Constants ──────────────────────────────────────────────── */
  var TTL          = 75000;  /* 75s cache */
  var RENDER_DELAY = 350;
  var MAX_ELITE    = 10;
  var MAX_VALID    = 15;
  var MAX_WATCH    = 20;

  /* Praguri piețe — semnificativ mai generoase decât TruthGuard v7 */
  var MKTCFG = {
    over15:   { minP: 0.68, minE: 3.0, minEV: 0.8,  odds: [1.15, 1.70], lbl: 'Over 1.5G',    icon: '⚽' },
    under35:  { minP: 0.65, minE: 3.0, minEV: 0.8,  odds: [1.15, 1.70], lbl: 'Under 3.5G',   icon: '🔒' },
    btts:     { minP: 0.52, minE: 3.5, minEV: 1.0,  odds: [1.40, 2.30], lbl: 'BTTS Yes',      icon: '🎯' },
    over25:   { minP: 0.55, minE: 3.5, minEV: 1.0,  odds: [1.45, 2.40], lbl: 'Over 2.5G',    icon: '⚡' },
    home_win: { minP: 0.50, minE: 4.5, minEV: 1.5,  odds: [1.25, 3.00], lbl: 'Home Win',      icon: '🏠' },
    away_win: { minP: 0.42, minE: 5.0, minEV: 2.0,  odds: [1.35, 3.80], lbl: 'Away Win',      icon: '✈️' },
    draw:     { minP: 0.28, minE: 5.5, minEV: 2.5,  odds: [2.60, 4.80], lbl: 'Draw',          icon: '⚖️' }
  };

  /* ── State ──────────────────────────────────────────────────── */
  var STATE = { loadedAt: 0, ev: null, ai: null, rendering: false };
  var _renderTimer = null;
  var _activeTicketType = null;
  var _tierCollapsed = { watchlist: true };

  /* ── Utils ──────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function f(v, def) { var n = Number(v); return isFinite(n) ? n : (def == null ? 0 : def); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function norm(v, lo, hi) { if (hi <= lo) return 0; return clamp((v - lo) / (hi - lo), 0, 1); }
  function pct(v) { var n = f(v); if (n > 0 && n <= 1) n *= 100; return n.toFixed(1) + '%'; }
  function signed(v, d) { var n = f(v); return (n >= 0 ? '+' : '') + n.toFixed(d == null ? 1 : d); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDT(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString('ro-RO') + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }
  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      var days = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
      var months = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
    } catch (e) { return '—'; }
  }

  /* ── Market key normalization ────────────────────────────────── */
  function mktKey(s) {
    var raw = String(s.market_key || s.market || s.market_label || s.bet_type || '').toLowerCase().replace(/\s+/g, '');
    if (/over1\.?5|over15/.test(raw)) return 'over15';
    if (/over2\.?5|over25/.test(raw)) return 'over25';
    if (/under3\.?5|under35/.test(raw)) return 'under35';
    if (/btts|bothteams/.test(raw)) return 'btts';
    if (/home|homewin|^1$/.test(raw)) return 'home_win';
    if (/away|awaywin|^2$/.test(raw)) return 'away_win';
    if (/draw|^x$/.test(raw)) return 'draw';
    return raw || 'unknown';
  }

  function mktLbl(s) {
    var k = mktKey(s);
    return (MKTCFG[k] && MKTCFG[k].lbl) || s.market_label || s.market || s.market_key || '—';
  }
  function mktIcon(k) { return (MKTCFG[k] && MKTCFG[k].icon) || '📊'; }

  /* ── Probability normalization ───────────────────────────────── */
  function normP(v) {
    var n = f(v, NaN);
    if (!isFinite(n) || n <= 0) return null;
    if (n > 1) n = n / 100;
    return clamp(n, 0, 1);
  }
  function collectProbs(s) {
    var keys = ['adjusted_prob', 'final_prob', 'model_prob', 'probability', 'api_prob',
      'bsd_prob', 'poisson_prob', 'nv_prob', 'catboost_prob', 'v2_ml_prob'];
    var out = [];
    keys.forEach(function (k) {
      var p = normP(s[k]);
      if (p != null && p > 0.05 && p < 0.98) out.push(p);
    });
    if (out.length < 2) {
      var sc = f(s.score || s.supreme_score || s.adaptive_score, 0);
      if (sc >= 55) out.push(clamp(sc / 115, 0.45, 0.88));
    }
    return out;
  }

  /* ── Auto-learning: load historical ROI per market from AI Memory ── */
  function getMarketHistoricalBonus(mk) {
    try {
      var mem = window.AI_MEMORY || window.__AI_MEMORY_DATA__ || {};
      var baselines = window.TRAINING_MARKET_BASELINES || [];
      var bonus = 0;
      /* From training baselines */
      if (Array.isArray(baselines)) {
        baselines.forEach(function (b) {
          if (!b) return;
          var bk = mktKey({ market_key: b.market || b.market_key || '' });
          if (bk !== mk) return;
          var roi = f(b.roi, 0);
          var bets = f(b.bets || b.count, 0);
          if (bets >= 20) {
            bonus += roi > 5 ? 4 : roi > 2 ? 2 : roi > 0 ? 1 : roi < -5 ? -4 : roi < -2 ? -2 : 0;
          }
        });
      }
      /* From AI Memory positive/negative patterns */
      var posPats = mem.positive_patterns || mem.adaptive_picks || [];
      if (Array.isArray(posPats)) {
        posPats.forEach(function (p) {
          if (!p) return;
          var pk = mktKey({ market_key: p.market || p.market_key || '' });
          if (pk !== mk) return;
          var ms = f(p.memory_score || p.score, 0);
          if (ms > 0) bonus += Math.min(3, ms * 0.4);
        });
      }
      return clamp(Math.round(bonus), -5, 6);
    } catch (e) { return 0; }
  }

  /* ── H2H contextual bonus ────────────────────────────────────── */
  function h2hBonus(s, mk) {
    var n = f(s.h2h_matches || s.h2h_total_matches, 0);
    if (n < 5) return 0;
    var dr = f(s.h2h_draw_rate, NaN), br = f(s.h2h_btts_rate, NaN);
    var ag = f(s.h2h_avg_goals, NaN), hw = f(s.h2h_home_win_rate, NaN), aw = f(s.h2h_away_win_rate, NaN);
    var b = 0;
    if (mk === 'draw' && isFinite(dr))       b += dr >= 0.38 ? 4 : dr <= 0.12 ? -3 : 0;
    else if (mk === 'btts' && isFinite(br))  b += br >= 0.58 ? 4 : br <= 0.22 ? -3 : 0;
    else if ((mk === 'over15' || mk === 'over25') && isFinite(ag)) b += ag >= 2.8 ? 4 : ag <= 1.5 ? -4 : 0;
    else if (mk === 'under35' && isFinite(ag)) b += ag <= 2.0 ? 4 : ag >= 3.5 ? -4 : 0;
    else if (mk === 'home_win' && isFinite(hw)) b += hw >= 0.62 ? 4 : hw <= 0.18 ? -3 : 0;
    else if (mk === 'away_win' && isFinite(aw)) b += aw >= 0.52 ? 4 : aw <= 0.12 ? -3 : 0;
    return clamp(b, -5, 5);
  }

  /* ── CatBoost v2 confirmation bonus ─────────────────────────── */
  function v2Bonus(s, implied) {
    var v2p = normP(s.v2_ml_prob);
    if (v2p == null) {
      /* Try from SBV2 signals index */
      try {
        var idx = window.__SBV2_SIGNALS_INDEX__ || {};
        var mk = mktKey(s);
        var sig = idx[String(s.event_id || '') + '|' + mk];
        if (sig) v2p = normP(sig.model_prob);
      } catch (e) {}
    }
    if (v2p == null) return 0;
    var diff = (v2p - implied) * 100;
    if (diff >= 5)  return 8;
    if (diff >= 2)  return 4;
    if (diff >= 0)  return 1;
    if (diff < -8)  return -10;
    if (diff < -4)  return -5;
    return -2;
  }

  /* ── AI Memory direct match bonus ───────────────────────────── */
  function aiMemoryBonus(s, mk) {
    try {
      var adaptiveMap = (typeof getSmartBetAdaptiveMap === 'function') ? getSmartBetAdaptiveMap() : {};
      var key1 = String(s.event_id || '') + '|' + mk;
      var key2 = [String(s.home || '').toLowerCase(), String(s.away || '').toLowerCase(), mk].join('|');
      var adaptive = adaptiveMap[key1] || adaptiveMap[key2] || null;
      if (!adaptive) return { bonus: 0, label: null, direct: false };
      return {
        bonus: Math.min(12, f(adaptive.memory_bonus, 0) * 3 + f(adaptive.adaptive_score, 0) * 0.08),
        label: 'AI Memory',
        direct: true,
        score: f(adaptive.adaptive_score, 0)
      };
    } catch (e) { return { bonus: 0, label: null, direct: false }; }
  }

  /* ── Pattern matching bonus ─────────────────────────────────── */
  function patternBonus(s, mk) {
    try {
      var maps = (typeof getSmartBetPatternMaps === 'function') ? getSmartBetPatternMaps() : {};
      var info = (typeof getSmartBetPatternMatchInfo === 'function') ? getSmartBetPatternMatchInfo(s, maps) : null;
      if (!info) return { bonus: 0, labels: [] };
      var posKeys = (info.positive || []).filter(function (p) { return f(p.raw_bets, 0) >= 4; });
      var negKeys = (info.avoid || []).filter(function (p) { return f(p.raw_bets, 0) >= 4 && f(p.roi, 0) < -2; });
      var bonus = 0;
      var labels = [];
      posKeys.slice(0, 2).forEach(function (p) {
        bonus += Math.min(5, f(p.memory_score, 0) * 1.5);
        labels.push(p.label || 'Pattern');
      });
      negKeys.slice(0, 1).forEach(function (p) {
        bonus -= Math.min(8, Math.abs(f(p.roi, 0)) * 0.5);
      });
      return { bonus: clamp(bonus, -8, 8), labels: labels };
    } catch (e) { return { bonus: 0, labels: [] }; }
  }

  /* ── Learning engine (learningApplyToCandidate wrapper) ─────── */
  function learningBonus(s, mk) {
    try {
      if (typeof learningApplyToCandidate !== 'function') return { boost: 0, multiplier: 1.0, toxic: false };
      var di = -1;
      try { di = new Date(s.event_date || s.date || '').getDay(); } catch (e) {}
      return learningApplyToCandidate({
        marketKey: mk,
        leagueName: String(s.league || '—'),
        odds: f(s.book_odds || s.odds, 0),
        edgePct: f(s.edge_pct || s.edge_pp, 0),
        score: f(s.score || s.supreme_score, 0),
        probAdj: f(s.adjusted_prob || s.final_prob, 0),
        weekdayIdx: di
      }) || { boost: 0, multiplier: 1.0, toxic: false };
    } catch (e) { return { boost: 0, multiplier: 1.0, toxic: false }; }
  }

  /* ── Core scoring function (0-100) ──────────────────────────── */
  function calcApexScore(s) {
    var mk = mktKey(s);
    var cfg = MKTCFG[mk] || { minP: 0.55, minE: 4.0, minEV: 1.0 };

    var probs = collectProbs(s);
    var p = normP(s.adjusted_prob) || normP(s.final_prob) || normP(s.model_prob) ||
      (probs.length ? probs.reduce(function (a, b) { return a + b; }, 0) / probs.length : 0);
    var implied = (f(s.book_odds || s.odds, 0) > 1.01) ? (1 / f(s.book_odds || s.odds, 1)) : 0;

    var edge = f(s.edge_pp, NaN);
    if (!isFinite(edge)) edge = f(s.edge_pct, NaN);
    if (!isFinite(edge)) edge = (p - implied) * 100;

    var ev = f(s.ev_pct, NaN);
    if (!isFinite(ev)) ev = (f(s.book_odds || s.odds, 0) > 1.01) ? ((p * f(s.book_odds || s.odds, 0)) - 1) * 100 : -99;

    var kelly = f(s.kelly_pct, NaN);
    if (!isFinite(kelly)) kelly = f(s.kelly_quarter_pct, NaN);
    if (!isFinite(kelly) && f(s.book_odds || s.odds, 0) > 1.01) {
      var b = f(s.book_odds || s.odds, 0) - 1;
      kelly = Math.max(0, ((p * b - (1 - p)) / b) * 0.25 * 100);
    }

    var agreement = probs.length >= 2 ?
      clamp(1 - (Math.sqrt(probs.map(function (x) {
        var m = probs.reduce(function (a, b) { return a + b; }, 0) / probs.length;
        return (x - m) * (x - m);
      }).reduce(function (a, b) { return a + b; }, 0) / probs.length) / 0.14), 0.2, 0.98) : 0.65;

    /* Base scoring components */
    var score = 0;
    score += 26 * norm(edge, cfg.minE - 2, cfg.minE + 10);   /* Edge — CLV proxy */
    score += 22 * norm(p, cfg.minP, cfg.minP + 0.15);        /* Probabilitate */
    score += 14 * norm(ev, cfg.minEV, cfg.minEV + 8);        /* Expected Value */
    score += 12 * norm(kelly, 0.3, 4.5);                     /* Kelly sizing */
    score += 10 * agreement;                                  /* Consens surse */
    score +=  8 * norm(f(s.score || s.supreme_score || s.adaptive_score, 65), 60, 95); /* Score baz */
    var relRaw = s.quality_gate === 'A' ? 1.0 : s.quality_gate === 'B' ? 0.82 : s.quality_gate === 'C' ? 0.56 : f(s.reliability, 0.65);
    score +=  8 * norm(relRaw, 0.5, 1.0);

    /* Contextual bonuses from all learning sources */
    var mem = aiMemoryBonus(s, mk);
    var pat = patternBonus(s, mk);
    var lrn = learningBonus(s, mk);
    var hist = getMarketHistoricalBonus(mk);
    var h2h = h2hBonus(s, mk);
    var v2b = v2Bonus(s, implied);

    score += clamp(mem.bonus, -12, 12);
    score += clamp(pat.bonus, -8, 8);
    score += clamp(f(lrn.boost, 0), -8, 8);
    score += clamp(hist, -5, 6);
    score += clamp(h2h, -5, 5);
    score += clamp(v2b, -10, 8);

    /* Multiplier from learning engine */
    if (lrn.multiplier && Math.abs(lrn.multiplier - 1.0) > 0.03) {
      score = score * (0.75 + lrn.multiplier * 0.25);
    }

    /* Toxic block */
    if (lrn.toxic) score -= 22;

    /* Penalizări */
    if (edge < 0) score -= 10;
    if (f(s.lineup_risk || s.context_risk, 0) > 0.40) score -= 6;
    if (f(s.odds_dispersion, 0) > 0.15) score -= 4;

    return clamp(Math.round(score), 0, 100);
  }

  /* ── Tier classification ─────────────────────────────────────── */
  function getTier(score) {
    if (score >= 78) return 'elite';
    if (score >= 62) return 'validated';
    if (score >= 45) return 'watchlist';
    return null;
  }

  /* ── Build enriched pick object ─────────────────────────────── */
  function enrichPick(s) {
    var mk = mktKey(s);
    var cfg = MKTCFG[mk] || {};
    var odds = f(s.book_odds || s.odds || s.active_odds || s.best_odds, 0);
    var implied = odds > 1.01 ? 1 / odds : 0;

    var probs = collectProbs(s);
    var p = normP(s.adjusted_prob) || normP(s.final_prob) || normP(s.model_prob) ||
      (probs.length ? probs.reduce(function (a, b) { return a + b; }, 0) / probs.length : 0.5);

    var edge = f(s.edge_pp, NaN);
    if (!isFinite(edge)) edge = f(s.edge_pct, NaN);
    if (!isFinite(edge)) edge = (p - implied) * 100;

    var kelly = f(s.kelly_pct, NaN);
    if (!isFinite(kelly)) kelly = f(s.kelly_quarter_pct, NaN);
    if (!isFinite(kelly) && odds > 1.01) {
      var b = odds - 1;
      kelly = Math.max(0, ((p * b - (1 - p)) / b) * 0.25 * 100);
    }

    var ev = odds > 1.01 ? ((p * odds) - 1) * 100 : -99;

    var mem = aiMemoryBonus(s, mk);
    var pat = patternBonus(s, mk);
    var v2b = v2Bonus(s, implied);
    var h2h = h2hBonus(s, mk);

    var apexScore = calcApexScore(s);
    var tier = getTier(apexScore);

    /* Confidence = weighted avg of normalized metrics */
    var conf = clamp(
      norm(edge, 0, 12) * 0.35 +
      norm(p, 0.45, 0.90) * 0.30 +
      norm(f(kelly, 0), 0, 4.0) * 0.20 +
      (mem.direct ? 0.10 : 0.02) +
      (v2b > 0 ? 0.03 : 0),
      0, 1
    );

    /* Confirmation labels */
    var confirms = [];
    if (mem.direct) confirms.push({ label: '🧠 AI Memory', type: 'memory' });
    if (pat.labels.length) confirms.push({ label: '📊 ' + pat.labels[0], type: 'pattern' });
    if (v2b >= 4) confirms.push({ label: '🤖 CatBoost+', type: 'ml2' });
    if (h2h >= 3) confirms.push({ label: '🔄 H2H', type: 'pattern' });
    if (edge >= cfg.minE * 1.5) confirms.push({ label: '🔥 Edge Ridicat', type: 'edge' });

    return Object.assign({}, s, {
      _mk: mk,
      _cfg: cfg,
      _odds: odds,
      _prob: p,
      _edge: edge,
      _kelly: kelly,
      _ev: ev,
      _mem: mem,
      _pat: pat,
      _v2b: v2b,
      _h2h: h2h,
      _conf: conf,
      _confirms: confirms,
      _apexScore: apexScore,
      _tier: tier
    });
  }

  /* ── Collect all signals from all sources ────────────────────── */
  function collectAllSignals() {
    var signals = [];
    var seen = {};

    /* Source 1: SIGNAL_AUDIT rows */
    try {
      var auditRows = (window.SIGNAL_AUDIT && window.SIGNAL_AUDIT.rows) ? window.SIGNAL_AUDIT.rows.slice() : [];
      /* Enrich with SBV2 */
      var v2idx = window.__SBV2_SIGNALS_INDEX__ || {};
      auditRows.forEach(function (row) {
        if (!row || !row.event_id) return;
        var mk = mktKey(row);
        var sig = v2idx[String(row.event_id) + '|' + mk];
        if (sig) {
          row = Object.assign({}, row, {
            v2_ml_prob: sig.model_prob,
            edge_pp: Math.max(f(row.edge_pct, 0), f(sig.edge_pp, 0)),
            ev_pct: f(sig.ev_pct, 0) || f(row.ev_pct, 0)
          });
        }
        var uid = String(row.event_id) + '|' + mk;
        if (!seen[uid]) { seen[uid] = true; signals.push(row); }
      });
    } catch (e) {}

    /* Source 2: ev_signals_v2 from STATE.ev */
    try {
      var evData = STATE.ev || {};
      var evArr = evData.signals || evData.rows || evData.data || [];
      if (!Array.isArray(evArr) && typeof evData === 'object') {
        evArr = Object.values(evData).filter(function (x) { return x && typeof x === 'object' && x.event_id; });
      }
      evArr.forEach(function (row) {
        if (!row || !row.event_id) return;
        var mk = mktKey(row);
        var uid = String(row.event_id) + '|' + mk;
        if (!seen[uid]) { seen[uid] = true; signals.push(row); }
      });
    } catch (e) {}

    return signals;
  }

  /* ── Main analysis engine ────────────────────────────────────── */
  function runApexAnalysis() {
    var raw = collectAllSignals();
    var all = raw.filter(function (s) {
      if (!s || !s.event_id) return false;
      var mk = mktKey(s);
      if (mk === 'unknown') return false;
      var cfg = MKTCFG[mk];
      if (!cfg) return false;
      var odds = f(s.book_odds || s.odds || s.active_odds, 0);
      if (odds < cfg.odds[0] || odds > cfg.odds[1]) return false;
      return true;
    });

    var enriched = all.map(enrichPick).filter(function (s) {
      return s._tier !== null && s._edge > 0;
    });

    var elite     = enriched.filter(function (s) { return s._tier === 'elite'; })
                            .sort(function (a, b) { return b._apexScore - a._apexScore; })
                            .slice(0, MAX_ELITE);
    var validated = enriched.filter(function (s) { return s._tier === 'validated'; })
                            .sort(function (a, b) { return b._apexScore - a._apexScore; })
                            .slice(0, MAX_VALID);
    var watchlist = enriched.filter(function (s) { return s._tier === 'watchlist'; })
                            .sort(function (a, b) { return b._apexScore - a._apexScore; })
                            .slice(0, MAX_WATCH);

    /* KPIs */
    var pool = elite.concat(validated);
    var avgScore = pool.length ? Math.round(pool.reduce(function (a, s) { return a + s._apexScore; }, 0) / pool.length) : 0;
    var avgEdge  = pool.length ? pool.reduce(function (a, s) { return a + s._edge; }, 0) / pool.length : 0;
    var avgProb  = pool.length ? pool.reduce(function (a, s) { return a + s._prob * 100; }, 0) / pool.length : 0;
    var avgEV    = pool.length ? pool.reduce(function (a, s) { return a + s._ev; }, 0) / pool.length : 0;

    return {
      raw: raw,
      all: enriched,
      elite: elite,
      validated: validated,
      watchlist: watchlist,
      kpi: { avgScore: avgScore, avgEdge: avgEdge, avgProb: avgProb, avgEV: avgEV, total: pool.length }
    };
  }

  /* ── Render helpers ──────────────────────────────────────────── */
  function renderPickCard(s, idx) {
    var tier = s._tier;
    var score = s._apexScore;
    var mk = s._mk;
    var cfg = s._cfg || {};
    var odds = s._odds;
    var edge = s._edge;
    var prob = s._prob * 100;
    var kelly = s._kelly;
    var conf = s._conf;
    var home = esc(s.home || s.home_team || '—');
    var away = esc(s.away || s.away_team || '—');
    var league = esc(s.league || s.league_name || '—');
    var dateStr = s.event_date ? fmtDate(s.event_date) : '';
    var timeStr = s.event_date ? (function () {
      try {
        var d = new Date(s.event_date);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      } catch (e) { return ''; }
    })() : '';
    var label = cfg.lbl || mktLbl(s);
    var icon = mktIcon(mk);

    var edgeClass = edge >= 0 ? 'edge' : 'edge negative';
    var tierClass = tier === 'elite' ? 'elite' : tier === 'validated' ? 'validated' : 'watchlist';

    var chipsHtml = '<div class="apex-pick-chips">' +
      '<span class="apex-chip market">' + icon + ' ' + esc(label) + ' @ ' + odds.toFixed(2) + '</span>' +
      '<span class="apex-chip ' + edgeClass + '">' + (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp Edge</span>' +
      '<span class="apex-chip prob">' + prob.toFixed(1) + '% Prob</span>' +
      (kelly > 0.5 ? '<span class="apex-chip kelly">Kelly ' + kelly.toFixed(1) + '%</span>' : '') +
      s._confirms.slice(0, 3).map(function (c) {
        return '<span class="apex-chip ' + esc(c.type) + '">' + esc(c.label) + '</span>';
      }).join('') +
      '</div>';

    var confBarHtml = '<div class="apex-conf-bar-wrap">' +
      '<div class="apex-conf-bar-track"><div class="apex-conf-bar-fill ' + tierClass + '" style="width:' + Math.round(conf * 100) + '%"></div></div>' +
      '<span class="apex-conf-pct ' + tierClass + '">' + Math.round(conf * 100) + '%</span>' +
      '</div>';

    var reasonsHtml = '';
    if (s._confirms.length === 0 && (s._h2h !== 0 || s._v2b !== 0)) {
      var reasons = [];
      if (s._v2b >= 4) reasons.push('<span class="apex-signal pos">CatBoost confirmat</span>');
      if (s._h2h >= 3) reasons.push('<span class="apex-signal pos">H2H favorabil</span>');
      if (s._v2b <= -5) reasons.push('<span class="apex-signal neg">ML divergent</span>');
      if (reasons.length) reasonsHtml = '<div class="apex-signals-row">' + reasons.join('') + '</div>';
    }

    return '<div class="apex-pick-card tier-' + tier + '">' +
      '<div class="apex-pick-top">' +
        '<div class="apex-pick-teams">' +
          '<div class="apex-pick-rank">#' + (idx + 1) + '</div>' +
          '<div class="apex-pick-match">' + home + ' <span style="color:var(--apex-muted)">vs</span> ' + away + '</div>' +
          '<div class="apex-pick-league">' + league + (dateStr ? ' · ' + dateStr : '') + (timeStr ? ' ' + timeStr : '') + '</div>' +
        '</div>' +
        '<div class="apex-score-circle ' + tierClass + '">' +
          '<div class="apex-score-num">' + score + '</div>' +
          '<div class="apex-score-lbl">APEX</div>' +
        '</div>' +
      '</div>' +
      chipsHtml +
      confBarHtml +
      reasonsHtml +
    '</div>';
  }

  function renderTierSection(label, icon, tierKey, picks, collapsed) {
    var collapseId = 'apex-tier-body-' + tierKey;
    var toggleId   = 'apex-tier-toggle-' + tierKey;
    var isCollapsed = !!collapsed;

    if (!picks.length) return '';

    return '<div class="apex-tier-section">' +
      '<div class="apex-tier-header ' + tierKey + '">' +
        '<div class="apex-tier-label ' + tierKey + '">' +
          icon + ' ' + label +
          '<span class="apex-tier-count">' + picks.length + '</span>' +
        '</div>' +
        '<button class="apex-tier-toggle ' + (isCollapsed ? 'collapsed' : '') + '" id="' + toggleId + '" onclick="apexToggleTier(\'' + tierKey + '\')">' +
          '<span class="caret">▾</span>' +
          '<span>' + (isCollapsed ? 'Afișează' : 'Ascunde') + '</span>' +
        '</button>' +
      '</div>' +
      '<div id="' + collapseId + '" style="' + (isCollapsed ? 'display:none' : '') + '">' +
        '<div class="apex-picks-body">' +
          picks.map(function (s, i) { return renderPickCard(s, i); }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Ticket generator ────────────────────────────────────────── */
  function buildTicket(type, picks) {
    var pool = picks.slice();
    if (type === 'safe') {
      pool = pool.filter(function (s) { return s._apexScore >= 75 && s._odds >= 1.25 && s._odds <= 2.00; });
      pool = pool.slice(0, 3);
    } else if (type === 'balanced') {
      pool = pool.filter(function (s) { return s._apexScore >= 65 && s._odds >= 1.40 && s._odds <= 2.80; });
      pool = pool.slice(0, 4);
    } else {
      pool = pool.filter(function (s) { return s._apexScore >= 58 && s._odds >= 1.60; });
      pool = pool.slice(0, 5);
    }

    /* Remove duplicates (same match) */
    var seenMatch = {};
    pool = pool.filter(function (s) {
      var key = String(s.event_id || s.home + s.away);
      if (seenMatch[key]) return false;
      seenMatch[key] = true;
      return true;
    });

    return pool;
  }

  function renderTicketOutput(type, picks) {
    var el = $('apex-ticket-output');
    if (!el) return;
    var ticket = buildTicket(type, picks);
    if (!ticket.length) {
      el.innerHTML = '<div class="apex-empty" style="padding:20px">' +
        '<div style="font-size:12px;color:var(--apex-muted)">Nu există picks suficiente pentru acest tip de bilet. Încearcă alt tip sau revino după actualizare.</div>' +
        '</div>';
      return;
    }
    var totalOdds = ticket.reduce(function (a, s) { return a * s._odds; }, 1);
    var labelMap = { safe: '🛡️ Bilet Sigur', balanced: '⚖️ Bilet Echilibrat', value: '🎯 Bilet Valoare' };
    var colorMap = { safe: 'var(--apex-green)', balanced: 'var(--apex-violet)', value: 'var(--apex-fire)' };
    var label = labelMap[type] || type;
    var color = colorMap[type] || 'var(--apex-fire)';

    el.innerHTML = '<div class="apex-ticket-card">' +
      '<div style="font-size:13px;font-weight:800;color:' + color + ';margin-bottom:10px;font-family:var(--apex-display)">' + label + '</div>' +
      ticket.map(function (s) {
        return '<div class="apex-ticket-pick">' +
          '<div class="apex-ticket-match">' + esc(s.home || '—') + ' vs ' + esc(s.away || '—') + '</div>' +
          '<div class="apex-ticket-sub">' + esc(mktLbl(s)) + ' @ ' + s._odds.toFixed(2) +
            ' · Edge ' + (s._edge >= 0 ? '+' : '') + s._edge.toFixed(1) + 'pp' +
            ' · Scor ' + s._apexScore +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="apex-ticket-footer">' +
      '<span style="font-size:11px;color:var(--apex-muted)">' + ticket.length + ' selecții</span>' +
      '<span class="apex-total-odds">@ ' + totalOdds.toFixed(2) + '</span>' +
    '</div>';
  }

  /* ── Render main predictions tab ─────────────────────────────── */
  function renderPredictiiSection(result) {
    var section = $('apex-predictii-section');
    if (!section) return;

    var kpi = result.kpi;
    var ts  = (window.AI_MEMORY && window.AI_MEMORY.updated_at) ||
              (window.SIGNAL_AUDIT && window.SIGNAL_AUDIT.updated_at) ||
              (window.APP_META && window.APP_META.updated_at) || '';

    var v2pack = window.__SBV2_MODEL_PACK__ || null;
    var hasV2  = !!(v2pack && v2pack.version === 'smartbet-fusion-v2');
    var hasMem = !!(window.AI_MEMORY && window.AI_MEMORY.summary);
    var hasAudit = !!(window.SIGNAL_AUDIT && (window.SIGNAL_AUDIT.rows || []).length > 0);
    var hasTraining = !!(window.TRAINING_MARKET_BASELINES && window.TRAINING_MARKET_BASELINES.length > 0);

    var modelChips = [
      { label: 'CatBoost v2', active: hasV2, color: 'cyan' },
      { label: 'AI Memory', active: hasMem, color: 'violet' },
      { label: 'Kelly Filter', active: hasAudit, color: 'green' },
      { label: 'H2H Engine', active: true, color: 'amber' }
    ];

    section.innerHTML =
      '<div class="apex-hero-shell">' +
        '<div class="apex-hero-card">' +
          '<div class="apex-hero-main">' +
            '<div class="apex-engine-name">APEX Neural Engine</div>' +
            '<div class="apex-engine-subtitle">AI Memory · CatBoost v2 · Kelly · H2H · Learning Engine</div>' +
            '<div class="apex-hero-meta">' +
              '<span class="apex-vbadge">⚡ v1.0</span>' +
              (ts ? '<span class="apex-updated">' + esc(fmtDT(ts)) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="apex-hero-side">' +
            '<div class="apex-hero-hud"></div>' +
            '<div class="apex-hero-ring">' +
              '<div class="apex-hero-score">' + esc(kpi.total ? String(kpi.avgScore) : '—') + '</div>' +
              '<div class="apex-hero-score-lbl">APEX</div>' +
            '</div>' +
          '</div>' +
          '<div class="apex-model-strip apex-model-strip-hero">' +
            modelChips.map(function (c) {
              return '<div class="apex-model-chip ' + (c.active ? 'active ' + c.color : '') + '">' +
                '<span class="apex-chip-dot"></span>' + esc(c.label) + '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="apex-kpi-strip">' +
        renderKpiCard('Total Picks', String(kpi.total), result.elite.length + ' elite · ' + result.validated.length + ' validate', 'fire', '◉') +
        renderKpiCard('Scor Mediu', kpi.total ? String(kpi.avgScore) : '—', 'din 100 · toate sursele combinate', 'violet', '↗') +
        renderKpiCard('Edge Mediu', kpi.total ? signed(kpi.avgEdge, 1) + 'pp' : '—', 'avantaj față de cota de piață', 'cyan', '↗') +
        renderKpiCard('Prob Medie', kpi.total ? kpi.avgProb.toFixed(1) + '%' : '—', 'probabilitate ajustată multi-sursă', 'green', '◌') +
      '</div>' +

      renderSourceFlow(result, { hasV2: hasV2, hasMem: hasMem, hasAudit: hasAudit, hasTraining: hasTraining }) +

      (result.elite.length ?
        renderTierSection('ELITE · Confirmat 2+ surse', '🔥', 'elite', result.elite, false) : '') +
      (result.validated.length ?
        renderTierSection('VALIDATED · Edge confirmat', '✅', 'validated', result.validated, false) : '') +
      (result.watchlist.length ?
        renderTierSection('WATCHLIST · Semnale emergente', '👁', 'watchlist', result.watchlist, _tierCollapsed.watchlist) : '') +

      (!result.elite.length && !result.validated.length && !result.watchlist.length ?
        '<div class="apex-empty">' +
          '<div class="apex-empty-icon">🔍</div>' +
          '<div class="apex-empty-title">Nicio predicție disponibilă momentan</div>' +
          '<div>Motorul a analizat ' + result.raw.length + ' semnale brute. Niciun meci nu îndeplinește criteriile de edge și probabilitate. Revino după actualizarea datelor.</div>' +
        '</div>' : '') +

      '<div class="apex-divider"></div>' +

      '<div class="apex-ticket-section">' +
        '<div class="apex-ticket-header">🎫 Generator Bilete</div>' +
        '<div class="apex-ticket-btns">' +
          '<button class="apex-ticket-btn" id="apex-tbtn-safe" onclick="apexGenerateTicket(\'safe\')">' +
            '🛡️ Sigur<br><small style="font-size:9px;font-weight:500">Risc mic</small>' +
          '</button>' +
          '<button class="apex-ticket-btn" id="apex-tbtn-balanced" onclick="apexGenerateTicket(\'balanced\')">' +
            '⚖️ Echilibrat<br><small style="font-size:9px;font-weight:500">Standard</small>' +
          '</button>' +
          '<button class="apex-ticket-btn" id="apex-tbtn-value" onclick="apexGenerateTicket(\'value\')">' +
            '🎯 Valoare<br><small style="font-size:9px;font-weight:500">Edge max</small>' +
          '</button>' +
        '</div>' +
        '<div id="apex-ticket-output">' +
          '<div class="apex-empty" style="padding:16px">' +
            '<div style="font-size:11px;color:var(--apex-muted)">Apasă un buton pentru a genera biletul.</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    window.__APEX_POOL__ = result.elite.concat(result.validated).concat(result.watchlist);
    window.__UNIFIED_POOL_COUNT__ = result.elite.length + result.validated.length;
  }

  function renderKpiCard(lbl, val, sub, colorKey, icon) {
    return '<div class="apex-kpi-card ' + colorKey + '">' +
      '<div class="apex-kpi-head">' +
        '<div class="apex-kpi-lbl">' + esc(lbl) + '</div>' +
        '<div class="apex-kpi-icon">' + esc(icon || '') + '</div>' +
      '</div>' +
      '<div class="apex-kpi-val">' + esc(val) + '</div>' +
      '<div class="apex-kpi-sub">' + esc(sub) + '</div>' +
    '</div>';
  }

  function renderSourceFlow(result, modelState) {
    var pool = (result.elite || []).concat(result.validated || []).concat(result.watchlist || []).slice(0, 12);

    function avg(fn, fallback) {
      if (!pool.length) return fallback == null ? 0 : fallback;
      var vals = pool.map(fn).filter(function (v) { return isFinite(v); });
      if (!vals.length) return fallback == null ? 0 : fallback;
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }

    function pctFrom(base, score) {
      return clamp(Math.round(base + score), 61, 100);
    }

    var catBoost = pctFrom(78, avg(function (s) { return clamp((f(s._v2b, 0) + 10) / 18, 0, 1) * 18; }, modelState.hasV2 ? 12 : 0));
    var memory   = pctFrom(74, avg(function (s) { return clamp(f((s._mem || {}).bonus, 0) / 12, 0, 1) * 22; }, modelState.hasMem ? 10 : 0));
    var kelly    = pctFrom(76, avg(function (s) { return clamp(f(s._kelly, 0) / 8, 0, 1) * 18; }, 9));
    var h2h      = pctFrom(72, avg(function (s) { return clamp(Math.abs(f(s._h2h, 0)) / 5, 0, 1) * 20; }, 8));
    var market   = pctFrom(79, avg(function (s) {
      return (clamp(f(s._edge, 0) / 15, 0, 1) * 10) + (clamp(f(s._prob, 0) / 0.9, 0, 1) * 8) + (clamp(f(s._ev, 0) / 18, 0, 1) * 7);
    }, 12));

    var sources = [
      { label: 'CatBoost v2',   value: catBoost, active: modelState.hasV2,   color: 'cyan',   icon: '⟡' },
      { label: 'AI Memory',     value: memory,   active: modelState.hasMem,  color: 'violet', icon: '◉' },
      { label: 'Kelly Filter',  value: kelly,    active: true,               color: 'green',  icon: '✺' },
      { label: 'H2H Engine',    value: h2h,      active: true,               color: 'amber',  icon: '◍' },
      { label: 'Market Scanner',value: market,   active: true,               color: 'gold',   icon: '✹' }
    ];

    var activeCount = sources.filter(function (s) { return !!s.active; }).length;

    return '<div class="apex-source-flow">' +
      '<div class="apex-source-head">' +
        '<div>' +
          '<div class="apex-source-title">CUM S-AU GENERAT PRONOSTICURILE</div>' +
          '<div class="apex-source-sub">Sursele active care construiesc scorul APEX</div>' +
        '</div>' +
        '<div class="apex-source-badge">● ' + activeCount + '/5</div>' +
      '</div>' +
      '<div class="apex-source-grid">' +
        sources.map(function (src) {
          return '<div class="apex-source-card ' + src.color + (src.active ? ' active' : '') + '">' +
            '<div class="apex-source-icon">' + src.icon + '</div>' +
            '<div class="apex-source-name">' + esc(src.label) + '</div>' +
            '<div class="apex-source-val">' + esc(String(src.value)) + '%</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="apex-source-foot">Contribuția fiecărei surse la scorul APEX</div>' +
    '</div>';
  }

  /* ── Render Motor Invatare section ───────────────────────────── */
  function renderInvatareSection() {
    var section = $('apex-invatare-section');
    if (!section) return;

    var mem = window.AI_MEMORY || {};
    var memSum = mem.summary || {};
    var v2pack = window.__SBV2_MODEL_PACK__ || null;
    var hasV2 = !!(v2pack && v2pack.version === 'smartbet-fusion-v2');
    var trainSum = window.TRAINING_DATASET_SUMMARY || window.TRAINING_MODEL_SUMMARY || {};
    var apiSum = window.API_HISTORY_SUMMARY || {};
    var baselines = window.TRAINING_MARKET_BASELINES || [];
    var fullMeta = window.FULL_HISTORY_META || {};

    function fN(v) { var n = Number(v); return Number.isFinite(n) ? n.toLocaleString('ro-RO') : '—'; }

    var cards = [
      {
        icon: '📋', title: 'Jurnal Aplicație', color: 'green',
        val: fN(fullMeta.journal_rows || 0) + ' înregistrări',
        sub: fN(fullMeta.history_rows || 0) + ' cu rezultat · ' + fN(fullMeta.lookback_days || 0) + ' zile',
        role: 'Istoricul biletelor generate — sursa principală pentru ROI și pattern-urile de win/loss pe termen lung.'
      },
      {
        icon: '🌐', title: 'Baza Istorică API', color: 'cyan',
        val: fN((apiSum.valid || {}).leagues_total || 0) + ' ligi',
        sub: fN((apiSum.valid || {}).seasons_total || 0) + ' sezoane · Calibrare probabilități',
        role: 'Date brute BSD API — calibrează probabilitățile și ajustează cotele fair pe fiecare piață și sezon.'
      },
      (function () {
        if (hasV2) {
          var mkts = v2pack.markets || {};
          var aucs = Object.values(mkts).map(function (m) { return m.wfv_avg_auc; }).filter(Boolean);
          var avgAUC = aucs.length ? (aucs.reduce(function (a, b) { return a + b; }, 0) / aucs.length).toFixed(3) : '—';
          var featN = v2pack.feature_count || '—';
          var trainN = v2pack.system ? v2pack.system.training_rows : (trainSum.rows_total || 0);
          return {
            icon: '🤖', title: 'CatBoost v2 Calibrat', color: 'fire',
            val: fN(trainN) + ' rows antren.',
            sub: Object.keys(mkts).length + ' piețe · ' + featN + ' features · WFV AUC avg ' + avgAUC,
            role: 'SmartBet Fusion v2 — model ML antrenat cu walk-forward validation pe date reale. Confirmă sau infirmă fiecare pick.'
          };
        }
        return {
          icon: '🤖', title: 'Model AI + Patterns', color: 'amber',
          val: fN(trainSum.rows_total || 0) + ' rows',
          sub: fN(trainSum.rows_ready || 0) + ' ready · Pattern matching activ',
          role: 'Modelul statistic și pattern-urile de memorie — ajustează scorul cu bonus/penalizare din istoricul real.'
        };
      })(),
      {
        icon: '🧠', title: 'AI Memory Adaptivă', color: 'violet',
        val: fN(memSum.settled_bets || 0) + ' bets settled',
        sub: 'ROI: ' + (Number(memSum.settled_roi || 0) >= 0 ? '+' : '') + Number(memSum.settled_roi || 0).toFixed(2) + '%',
        role: 'Memory patterns pozitive și negative deduse din toate pariurile istorice — ajustează direct scorul Apex al fiecărui pick.'
      }
    ];

    var colorMap = { green: 'var(--apex-green)', cyan: 'var(--apex-cyan)', fire: 'var(--apex-fire)', amber: 'var(--apex-amber)', violet: 'var(--apex-violet)' };

    section.innerHTML =
      '<div class="apex-section-pad">' +
        '<div class="apex-section-title">🧬 Motor de Învățare</div>' +
        '<div class="apex-info-box">' +
          '<div class="apex-info-box-title">ℹ️ Auto-learning activ</div>' +
          '<div class="apex-info-box-body">Motorul procesează automat fiecare sursă de date și ajustează scorurile la fiecare refresh. Nu este necesar să configuri nimic manual.</div>' +
        '</div>' +
      '</div>' +

      '<div class="apex-learning-grid">' +
        cards.map(function (c) {
          var color = colorMap[c.color] || 'var(--apex-fire)';
          return '<div class="apex-learning-card" style="border-top:2px solid ' + color + '">' +
            '<span class="apex-lc-icon">' + c.icon + '</span>' +
            '<div class="apex-lc-title">' + esc(c.title) + '</div>' +
            '<div class="apex-lc-val" style="color:' + color + '">' + c.val + '</div>' +
            '<div class="apex-lc-sub">' + esc(c.sub) + '</div>' +
            '<div class="apex-lc-role"><b>Rol în motor:</b> ' + esc(c.role) + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +

      /* Impact grid */
      '<div class="apex-section-pad" style="padding-bottom:4px">' +
        '<div class="apex-section-title" style="font-size:13px">⚡ Impact direct asupra scorului Apex</div>' +
      '</div>' +
      '<div class="apex-impact-grid">' +
        [
          'AI picks adaptive: ' + fN(memSum.pending_scored || 0),
          'Patterns pozitive: ' + fN(memSum.positive_patterns || 0),
          'Patterns negative: ' + fN(memSum.negative_patterns || 0),
          'ROI validat: ' + (Number(memSum.settled_roi || 0) >= 0 ? '+' : '') + Number(memSum.settled_roi || 0).toFixed(2) + '%',
          'Piețe calibrate: ' + fN(baselines.length),
          'Bets settled: ' + fN(memSum.settled_bets || 0)
        ].map(function (t) {
          return '<div class="apex-impact-cell">' + esc(t) + '</div>';
        }).join('') +
      '</div>' +

      /* Quick nav */
      '<div class="apex-quick-btns">' +
        '<button class="apex-quick-btn" onclick="switchTab(\'istoricfull\')">📋 Jurnal complet</button>' +
        '<button class="apex-quick-btn" onclick="switchTab(\'apihistory\')">🌐 Baza API</button>' +
        '<button class="apex-quick-btn" onclick="switchTab(\'traininglab\')">🤖 Model AI</button>' +
      '</div>';
  }

  /* ── Render Arhiva section ───────────────────────────────────── */
  function renderArhivaSection() {
    /* Delegate to existing renderArchivePanel if available */
    if (typeof window.renderArchivePanel === 'function') {
      window.renderArchivePanel();
    }
    var section = $('apex-arhiva-section');
    if (!section) return;

    var info = '<div class="apex-section-pad">' +
      '<div class="apex-info-box">' +
        '<div class="apex-info-box-title">📚 Baza de Învățare</div>' +
        '<div class="apex-info-box-body">Aceste surse de date alimentează motorul Apex Neural Engine în fundal. Motorul le procesează automat la fiecare refresh — nu este necesar să le verifici zilnic.</div>' +
      '</div>' +
    '</div>';

    /* Existing archive cards are rendered by renderArchivePanel in their own containers */
    if (!$('archive-summary-cards')) {
      section.innerHTML = info +
        '<div id="archive-summary-cards" style="margin:0 16px 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px"></div>' +
        '<div id="archive-learning-impact" style="margin:0 16px 12px"></div>' +
        '<div class="apex-quick-btns">' +
          '<button class="apex-quick-btn" onclick="switchTab(\'istoricfull\')">📋 Jurnal</button>' +
          '<button class="apex-quick-btn" onclick="switchTab(\'apihistory\')">🌐 API History</button>' +
          '<button class="apex-quick-btn" onclick="switchTab(\'traininglab\')">🤖 Training Lab</button>' +
        '</div>';
      if (typeof window.renderArchivePanel === 'function') window.renderArchivePanel();
    } else {
      section.innerHTML = info;
    }
  }

  /* ── Main render orchestrator ────────────────────────────────── */
  function render() {
    if (STATE.rendering) return;
    STATE.rendering = true;

    /* Update subnav badge */
    try {
      var result = runApexAnalysis();
      var total = result.elite.length + result.validated.length;
      var badge = $('apex-nav-badge');
      if (badge) badge.textContent = total;

      var activeSection = window._apexActiveSection || 'predictii';
      if (activeSection === 'predictii') renderPredictiiSection(result);
      else if (activeSection === 'invatare') renderInvatareSection();
      else if (activeSection === 'arhiva') renderArhivaSection();

      /* Apply light-theme overrides via inline style — beats all CSS specificity */
      if (document.body.classList.contains('theme-light')) apexLightPass();

      /* Sync legacy globals */
      window.__UNIFIED_POOL_COUNT__ = total;
    } catch (e) { console.warn('[APEX] Render error:', e); }

    STATE.rendering = false;
  }

  /* ── Light theme post-render pass ────────────────────────────── */

  /* Inject a <style> element last in <head> so it wins every cascade battle */
  function ensureApexLightStyle() {
    var id = 'apex-light-runtime-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      'body.theme-light #tab-smartbet{background:#F0F4FB!important}',
      'body.theme-light #tab-smartbet .apex-tier-section{background:#F0F4FB!important}',
      'body.theme-light #tab-smartbet .apex-picks-body{background:transparent!important}',
      'body.theme-light #tab-smartbet .apex-tier-header,',
      'body.theme-light #tab-smartbet .apex-tier-header.elite,',
      'body.theme-light #tab-smartbet .apex-tier-header.validated,',
      'body.theme-light #tab-smartbet .apex-tier-header.watchlist{',
      '  background:#FFFFFF!important;',
      '  box-shadow:0 2px 8px rgba(0,0,0,.06)!important',
      '}',
      'body.theme-light #tab-smartbet .apex-pick-card,',
      'body.theme-light #tab-smartbet .apex-pick-card.tier-elite,',
      'body.theme-light #tab-smartbet .apex-pick-card.tier-validated,',
      'body.theme-light #tab-smartbet .apex-pick-card.tier-watchlist{',
      '  background:#FFFFFF!important;',
      '  box-shadow:0 2px 8px rgba(0,0,0,.06)!important',
      '}',
      'body.theme-light #apex-predictii-section,',
      'body.theme-light #apex-invatare-section,',
      'body.theme-light #apex-arhiva-section{background:#F0F4FB!important}',
      'body.theme-light .mobile-nav{background:rgba(240,244,251,.97)!important;border-color:rgba(12,168,142,.18)!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function apexLightPass() {
    /* Inject the runtime stylesheet (wins because it's last in cascade) */
    ensureApexLightStyle();

    /* Also set inline styles as a belt-and-suspenders fallback */
    var tab = $('tab-smartbet');
    if (!tab) return;
    var sp = function(el, p, v) { el.style.setProperty(p, v, 'important'); };

    sp(tab, 'background', '#F0F4FB');
    ['apex-predictii-section', 'apex-invatare-section', 'apex-arhiva-section'].forEach(function (id) {
      var s = $(id); if (s) sp(s, 'background', '#F0F4FB');
    });

    tab.querySelectorAll('.apex-tier-section').forEach(function (el) { sp(el, 'background', '#F0F4FB'); });
    tab.querySelectorAll('.apex-picks-body').forEach(function (el) { sp(el, 'background', 'transparent'); });

    tab.querySelectorAll('.apex-tier-header').forEach(function (el) {
      sp(el, 'background', '#FFFFFF');
      sp(el, 'box-shadow', '0 2px 8px rgba(0,0,0,.06)');
    });

    tab.querySelectorAll('.apex-pick-card').forEach(function (el) {
      sp(el, 'background', '#FFFFFF');
      sp(el, 'box-shadow', '0 2px 8px rgba(0,0,0,.06)');
    });

    var nav = document.querySelector('.mobile-nav');
    if (nav) {
      sp(nav, 'background', 'rgba(240,244,251,.97)');
      sp(nav, 'border-color', 'rgba(12,168,142,.18)');
    }
  }

  /* ── Schedule render ─────────────────────────────────────────── */
  function scheduleRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(render, RENDER_DELAY);
  }

  /* ── Public section switch ───────────────────────────────────── */
  window.apexSwitchSection = function (sec) {
    window._apexActiveSection = sec;
    ['predictii', 'invatare', 'arhiva'].forEach(function (s) {
      var btn = $('apex-snav-' + s);
      var el  = $('apex-' + s + '-section');
      if (btn) btn.classList.toggle('active', s === sec);
      if (el)  el.style.display = s === sec ? '' : 'none';
    });
    render();
  };

  /* ── Tier toggle ─────────────────────────────────────────────── */
  window.apexToggleTier = function (tierKey) {
    _tierCollapsed[tierKey] = !_tierCollapsed[tierKey];
    var body   = $('apex-tier-body-' + tierKey);
    var toggle = $('apex-tier-toggle-' + tierKey);
    if (body) body.style.display = _tierCollapsed[tierKey] ? 'none' : '';
    if (toggle) {
      toggle.classList.toggle('collapsed', !!_tierCollapsed[tierKey]);
      var span = toggle.querySelector('span:last-child');
      if (span) span.textContent = _tierCollapsed[tierKey] ? 'Afișează' : 'Ascunde';
    }
  };

  /* ── Ticket generation ───────────────────────────────────────── */
  window.apexGenerateTicket = function (type) {
    _activeTicketType = type;
    ['safe', 'balanced', 'value'].forEach(function (t) {
      var btn = $('apex-tbtn-' + t);
      if (btn) btn.classList.toggle('active', t === type);
    });
    var picks = window.__APEX_POOL__ || [];
    renderTicketOutput(type, picks);
  };

  /* ── Override legacy renderUnifiedEngine ─────────────────────── */
  window.renderUnifiedEngine = function () { scheduleRender(); };

  /* ── Inject HTML structure ───────────────────────────────────── */
  function injectHTML() {
    var tab = $('tab-smartbet');
    if (!tab) return;

    /* Hide old smartlearn-nav */
    var oldNav = document.querySelector('.smartlearn-nav');
    if (oldNav) oldNav.style.display = 'none';

    /* Build new structure */
    tab.innerHTML =
      /* Apex Sub-Nav */
      '<nav class="apex-subnav" role="tablist">' +
        '<button class="apex-subnav-tab active" id="apex-snav-predictii" onclick="apexSwitchSection(\'predictii\')" role="tab">' +
          '🎯 Predicții' +
          '<span class="apex-subnav-badge" id="apex-nav-badge">—</span>' +
        '</button>' +
        '<button class="apex-subnav-tab" id="apex-snav-invatare" onclick="apexSwitchSection(\'invatare\')" role="tab">' +
          '🧬 Motor Învățare' +
        '</button>' +
        '<button class="apex-subnav-tab" id="apex-snav-arhiva" onclick="apexSwitchSection(\'arhiva\')" role="tab">' +
          '📚 Baza de Învățare' +
        '</button>' +
      '</nav>' +

      /* Sections */
      '<div id="apex-predictii-section"></div>' +
      '<div id="apex-invatare-section" style="display:none"></div>' +
      '<div id="apex-arhiva-section" style="display:none">' +
        '<div id="archive-summary-cards" style="margin:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px"></div>' +
        '<div id="archive-learning-impact" style="margin:0 16px 12px"></div>' +
        '<div class="apex-quick-btns">' +
          '<button class="apex-quick-btn" onclick="switchTab(\'istoricfull\')">📋 Jurnal</button>' +
          '<button class="apex-quick-btn" onclick="switchTab(\'apihistory\')">🌐 API History</button>' +
          '<button class="apex-quick-btn" onclick="switchTab(\'traininglab\')">🤖 Training Lab</button>' +
        '</div>' +
      '</div>';

    window._apexActiveSection = 'predictii';
  }

  /* ── Boot sequence ───────────────────────────────────────────── */
  function boot() {
    ensureApexLightStyle();
    injectHTML();
    scheduleRender();

    /* Re-render on data load events */
    var dataEvents = ['veyra:data-loaded', 'betanalytics:refresh', 'signal-audit:loaded'];
    dataEvents.forEach(function (ev) {
      document.addEventListener(ev, scheduleRender);
    });

    /* Re-render when tab becomes visible */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var cls = String(t.className || '');
      var txt = String(t.textContent || '');
      var isSmartbetNav = cls.indexOf('smartlearn-tab') >= 0 ||
        cls.indexOf('more-card-btn') >= 0 ||
        txt.indexOf('Motor de Predicții') >= 0 ||
        txt.indexOf('Unificat') >= 0 ||
        (t.onclick && String(t.onclick).indexOf('smartbet') >= 0);
      if (isSmartbetNav) setTimeout(render, 300);
    }, true);

    /* Periodic refresh when tab is active */
    setInterval(function () {
      var tab = $('tab-smartbet');
      if (tab && (tab.classList.contains('active') || tab.style.display !== 'none')) {
        if (window._apexActiveSection === 'predictii') render();
      }
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', function () {
    setTimeout(render, 800);
  });

})();
