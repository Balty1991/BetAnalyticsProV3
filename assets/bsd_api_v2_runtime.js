/* BSD API v2 runtime bridge
   Keeps frontend detail enrichment aligned with the BSD v2 event endpoint
   without touching the large generated app bundle. */
(function(){
  'use strict';
  var BASE_URL = 'https://sports.bzzoiro.com';
  var PREFIX = '/api/v2';
  var AUTH_SCHEME = 'Token';

  function apiUrl(path){
    path = String(path || '').replace(/^\/+/, '');
    return BASE_URL + PREFIX + '/' + path;
  }

  function unwrapObject(data){
    return data && data.data && typeof data.data === 'object' && !Array.isArray(data.data)
      ? data.data
      : data;
  }

  function normalizeEvent(event){
    if(!event || typeof event !== 'object') return event;
    var out = Object.assign({}, event);
    if(!out.league && (out.league_id != null || out.league_name)){
      out.league = { id: out.league_id, api_id: out.league_id, name: out.league_name || 'Unknown' };
    }
    function teamObj(side){
      var objKey = side + '_team_obj';
      if(out[objKey] && typeof out[objKey] === 'object') return out[objKey];
      var id = out[side + '_team_id'];
      var name = out[side + '_team'] || out[side];
      if(id == null && !name) return {};
      return { id: id, api_id: id, name: name };
    }
    out.home_team_obj = teamObj('home');
    out.away_team_obj = teamObj('away');
    if(out.home_halftime_score == null && out.home_score_ht != null) out.home_halftime_score = out.home_score_ht;
    if(out.away_halftime_score == null && out.away_score_ht != null) out.away_halftime_score = out.away_score_ht;
    return out;
  }

  window.BSD_API_V2 = Object.assign(window.BSD_API_V2 || {}, {
    baseUrl: BASE_URL,
    prefix: PREFIX,
    apiUrl: apiUrl,
    unwrapObject: unwrapObject,
    normalizeEvent: normalizeEvent
  });

  if(typeof window.fetchEventDetail === 'function'){
    window.fetchEventDetail = function(eventId){
      if(!eventId) return Promise.resolve(null);
      var eid = String(eventId);
      window.ENRICHED_EVENT_CACHE = window.ENRICHED_EVENT_CACHE || {};
      window.ENRICHMENT_PENDING = window.ENRICHMENT_PENDING || {};
      if(window.ENRICHED_EVENT_CACHE[eid]) return Promise.resolve(window.ENRICHED_EVENT_CACHE[eid]);
      if(window.ENRICHMENT_PENDING[eid]) return window.ENRICHMENT_PENDING[eid];

      var token = window.API_TOKEN || localStorage.getItem('bsd_token') || '';
      if(!token) return Promise.resolve(null);

      window.ENRICHMENT_PENDING[eid] = fetch(apiUrl('events/' + eid + '/'), {
        headers: { 'Authorization': AUTH_SCHEME + ' ' + token },
        cache: 'no-store'
      })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){
        data = normalizeEvent(unwrapObject(data));
        if(data){ window.ENRICHED_EVENT_CACHE[eid] = data; }
        delete window.ENRICHMENT_PENDING[eid];
        return data || null;
      })
      .catch(function(){
        delete window.ENRICHMENT_PENDING[eid];
        return null;
      });
      return window.ENRICHMENT_PENDING[eid];
    };
  }
})();
