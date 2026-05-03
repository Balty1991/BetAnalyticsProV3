#!/usr/bin/env python3
"""Ensure the CLV card guidance runtime is loaded by the frontend.

The app already loads assets/smartbet_v2_integration.js. This patch appends a
small loader to that file so assets/clv_card_guidance_runtime.js is fetched on
GitHub Pages without editing the large index.html/app.js directly.
"""
from pathlib import Path

TARGET = Path("assets/smartbet_v2_integration.js")
MARKER = "__baClvGuidanceLoaderV1"
SNIPPET = """

// BetAnalytics Pro - load CLV guidance badges on match cards
(function(){
  'use strict';
  if(window.__baClvGuidanceLoaderV1) return;
  window.__baClvGuidanceLoaderV1 = true;
  function load(){
    if(document.getElementById('ba-clv-card-guidance-runtime')) return;
    var s = document.createElement('script');
    s.id = 'ba-clv-card-guidance-runtime';
    s.defer = true;
    s.src = './assets/clv_card_guidance_runtime.js?v=' + Date.now();
    document.head.appendChild(s);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
"""


def main():
    if not TARGET.exists():
        print(f"[CLV-GUIDE] Missing {TARGET}")
        return
    txt = TARGET.read_text(encoding="utf-8")
    if MARKER in txt:
        print("[CLV-GUIDE] Loader already present")
        return
    TARGET.write_text(txt.rstrip() + SNIPPET + "\n", encoding="utf-8")
    print("[CLV-GUIDE] Loader appended")


if __name__ == "__main__":
    main()
