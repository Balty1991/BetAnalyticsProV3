# API History Total + Learning Engine Plan

## Obiectiv
Adăugarea a două zone noi în BetAnalytics Pro:

1. **Istoric API total**
   - arhivă separată de jurnalul intern de predicții
   - bazată pe date istorice brute din BSD API
   - focus pe sezoane, meciuri, rezultate finale și orice câmpuri istorice disponibile

2. **AI Training / Learning Engine**
   - motor de învățare pe date istorice
   - generare dataset de antrenare din istoricul API
   - evaluare pe ferestre temporale și pe ligi/piețe

---

## Faza 1 — Istoric API total

### Scop
Creăm o secțiune în `Mai mult` numită **Istoric API total**.

### Ce trebuie să afișeze
- acoperire istorică disponibilă
- ligi disponibile istoric
- sezoane disponibile pe ligă
- număr meciuri pe sezon
- rezultate finale
- distribuții de goluri
- win/draw/loss pe sezon / ligă
- BTTS / Over 1.5 / Over 2.5 / Under 3.5 istorice
- formă istorică a ligilor și piețelor
- filtre pe:
  - ligă
  - sezon
  - interval ani
  - piață
  - status date disponibile

### Endpointuri candidate
- `/api/seasons/`
- `/api/events/?season=ID`
- alte endpointuri istorice BSD disponibile pentru match stats / odds / standings / teams / leagues

### Fișiere date propuse
- `data/api_seasons_history.json`
- `data/api_events_history_index.json`
- `data/api_history_summary.json`
- `data/api_history_markets.json`
- `data/api_history_leagues.json`

### UI propus
În `Mai mult`:
- `Istoric total` = jurnalul intern al predicțiilor tale
- `Istoric API total` = baza istorică brută din BSD API
- `AI Training Lab` = motorul de antrenare și analiză

---

## Faza 2 — Data Warehouse pentru antrenare

### Dataset principal
Un rând = un meci istoric.

### Câmpuri minime
- event_id
- league_id
- league_name
- season_id
- season_name
- date
- home_team
- away_team
- home_score
- away_score
- total_goals
- result_1x2
- btts_yes
- over_15
- over_25
- under_35
- odds_home
- odds_draw
- odds_away
- odds_over_15
- odds_over_25
- odds_under_35
- odds_btts_yes
- odds_btts_no

### Feature engineering
- rolling form 5 / 10 meciuri
- medie goluri marcate / primite
- home vs away split
- rate BTTS
- rate over/under pe ferestre
- diferență formă între echipe
- implied probabilities din cote
- no-vig probabilities
- strength rating pe ligă și echipă
- bucketuri odds / scoring / volatility

### Fișiere propuse
- `data/training_matches.json`
- `data/training_features.json`
- `data/training_targets.json`
- `data/training_metadata.json`

---

## Faza 3 — Learning Engine

### Ținte de model
Modele separate pentru:
- 1X2
- Over 1.5
- Over 2.5
- Under 3.5
- BTTS

### Strategia corectă
Nu un singur model universal, ci:
- model global
- model pe ligă
- model pe piață
- blend între model global + ligă + heuristici curente

### Output dorit
Pentru fiecare meci:
- probability model
- probability market
- edge
- fair odds
- confidence
- historical support score
- training support sample size
- reason codes

---

## Faza 4 — Training / Validation

### Mod de evaluare
- split temporal, nu random
- train pe trecut, validate pe perioade mai noi
- monitorizare pe:
  - săptămânal
  - lunar
  - anual
  - total

### KPI-uri
- accuracy
- log loss
- Brier score
- ROI
- yield
- hit rate
- calibration error
- profit per market
- profit per league
- max drawdown

---

## Faza 5 — AI Memory / Auto-Learning

### Ce învață motorul
- ce ligi performează bine pe fiecare piață
- ce intervale de cote sunt profitabile
- ce pattern-uri istorice trebuie evitate
- ce combinații ligă + piață + odds + sezon au edge stabil

### Reguli adaptive
- boost pe piețe/ligi validate istoric
- downgrade pe pattern-uri slabe
- blocare automată a zonelor cu ROI negativ persistent

---

## Decizie de produs
Da, se poate face.

Dar arhitectura corectă este în 3 blocuri separate:
1. **Istoric total** — ce a recomandat aplicația ta
2. **Istoric API total** — date istorice brute BSD
3. **AI Training Lab** — motor de învățare și antrenare pe istoricul brut

Asta este varianta robustă. Dacă încercăm să băgăm totul într-o singură secțiune, UI-ul devine haotic și greu de întreținut.
