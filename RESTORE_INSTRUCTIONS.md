# Instrucțiuni restaurare VEYRA din arhiva atașată

ȘTERGE din GitHub (există în repo actual, nu există în arhiva bună):
- app.js
- data/ui_picks_log.json

ÎNLOCUIEȘTE/ADAUGĂ fișierele din acest ZIP la aceeași locație în repo:
- .github/workflows/fetch-data.yml
- .keep-alive
- assets/app.js
- assets/fetch_data.py
- build_clv_tracker.py
- build_full_history.py
- build_model_benchmarks.py
- build_model_quality.py
- build_prediction_type_history.py
- build_pro_intelligence.py
- data/ai_memory.json
- data/backtest.json
- data/build_status.json
- data/enriched.json
- data/ev_signals_v2.json
- data/events.json
- data/history_engine.json
- data/incidents_cache.json
- data/meta.json
- data/model_quality.json
- data/player_profiles_cache.json
- data/player_stats_cache.json
- data/predictions.json
- data/pro_intelligence.json
- data/recommendation_log.json
- data/shotmap_cache.json
- data/signal_audit.json
- data/social_news_cache.json
- data/stats_cache.json
- data/supreme_engine_v5.json
- data/teams.json
- fetch_data.py
- generate_meciuri_snapshot.py
- index.html

După upload: rulează GitHub Pages build/deploy sau așteaptă deploy automat. Pentru date proaspete, rulează workflow-ul update/fetch după ce verifici că interfața a revenit.
