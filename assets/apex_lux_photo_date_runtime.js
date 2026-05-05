/* BetAnalytics Pro — PHOTO EXACT date header runtime
   Converts the Meciuri date separator to the reference calendar badge + uppercase label. */
(function(){
  'use strict';
  var scheduled = false;

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[ch];
    });
  }

  function normalizeDateText(value){
    return String(value || '')
      .replace(/^\s*📅\s*/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function badgeParts(label){
    var parts = normalizeDateText(label).split(/\s+/).filter(Boolean);
    var day = '—';
    var month = '';
    for(var i=0;i<parts.length;i++){
      if(/^\d{1,2}$/.test(parts[i])){ day = parts[i]; break; }
    }
    for(var j=parts.length-1;j>=0;j--){
      if(!/^\d{1,2}$/.test(parts[j])){ month = parts[j]; break; }
    }
    return {
      day: day,
      month: (month || 'DAT').slice(0,3).toUpperCase()
    };
  }

  function render(label){
    var clean = normalizeDateText(label) || 'Data indisponibilă';
    var parts = badgeParts(clean);
    return '<span class="date-cal-badge" aria-hidden="true"><b>' + esc(parts.month) + '</b><em>' + esc(parts.day) + '</em></span>' +
      '<span class="date-label-text">' + esc(clean) + '</span>';
  }

  function convertOne(label){
    if(!label || label.classList.contains('date-label-photo')) return;
    var clean = normalizeDateText(label.getAttribute('data-photo-date-original') || label.textContent);
    if(!clean) return;
    label.setAttribute('data-photo-date-original', clean);
    label.classList.add('date-label-photo');
    label.innerHTML = render(clean);
  }

  function apply(){
    scheduled = false;
    var root = document.querySelector('#tab-meciuri') || document;
    root.querySelectorAll('.date-group > .date-label, .date-label').forEach(convertOne);
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule, { once:true });
  } else {
    schedule();
  }

  var observer = new MutationObserver(schedule);
  observer.observe(document.documentElement || document.body, { childList:true, subtree:true });
})();
