#!/usr/bin/env python3
"""Ensure CLV guidance badges are loaded by the frontend.

This patch is intentionally idempotent and touches both:
- index.html: direct script include with a fresh version query, so CDN/PWA cache is busted.
- assets/smartbet_v2_integration.js: fallback dynamic loader.
"""
from pathlib import Path

SMARTBET = Path("assets/smartbet_v2_integration.js")
INDEX = Path("index.html")
RUNTIME_SRC = "./assets/clv_card_guidance_runtime.js?v=20260503clvguide3"
LOADER_MARKER = "__baClvGuidanceLoaderV1"
INDEX_MARKER = "ba-clv-card-guidance-runtime-direct"

SNIPPET = """

// BetAnalytics Pro - load CLV guidance badges on match cards
(function(){
  'use strict';
  if(window.__baClvGuidanceLoaderV1) return;
  window.__baClvGuidanceLoaderV1 = true;
  function load(){
    if(document.getElementById('ba-clv-card-guidance-runtime') || document.getElementById('ba-clv-card-guidance-runtime-direct')) return;
    var s = document.createElement('script');
    s.id = 'ba-clv-card-guidance-runtime';
    s.defer = true;
    s.src = './assets/clv_card_guidance_runtime.js?v=20260503clvguide3';
    document.head.appendChild(s);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
"""


def patch_smartbet() -> bool:
    if not SMARTBET.exists():
        print(f"[CLV-GUIDE] Missing {SMARTBET}")
        return False
    txt = SMARTBET.read_text(encoding="utf-8")
    if LOADER_MARKER in txt and "20260503clvguide3" in txt:
        print("[CLV-GUIDE] SmartBet loader already current")
        return False
    if LOADER_MARKER in txt:
        start = txt.find("// BetAnalytics Pro - load CLV guidance badges on match cards")
        if start >= 0:
            txt = txt[:start].rstrip()
    SMARTBET.write_text(txt.rstrip() + SNIPPET + "\n", encoding="utf-8")
    print("[CLV-GUIDE] SmartBet fallback loader updated")
    return True


def patch_index() -> bool:
    if not INDEX.exists():
        print(f"[CLV-GUIDE] Missing {INDEX}")
        return False
    txt = INDEX.read_text(encoding="utf-8")
    script = f'<script defer id="{INDEX_MARKER}" src="{RUNTIME_SRC}"></script>'

    if INDEX_MARKER in txt:
        import re
        new = re.sub(
            r'<script[^>]+id=["\']ba-clv-card-guidance-runtime-direct["\'][^>]*></script>',
            script,
            txt,
            count=1,
        )
        if new != txt:
            INDEX.write_text(new, encoding="utf-8")
            print("[CLV-GUIDE] index.html direct script version refreshed")
            return True
        print("[CLV-GUIDE] index.html direct script already current")
        return False

    anchor = '<script defer src="./assets/app.js?v=20260429consensus2"></script>'
    if anchor in txt:
        txt = txt.replace(anchor, script + "\n" + anchor, 1)
    else:
        txt = txt.replace("</head>", script + "\n</head>", 1)
    INDEX.write_text(txt, encoding="utf-8")
    print("[CLV-GUIDE] index.html direct script added")
    return True


def main():
    changed = patch_smartbet() or patch_index()
    if not changed:
        print("[CLV-GUIDE] No changes needed")


if __name__ == "__main__":
    main()
