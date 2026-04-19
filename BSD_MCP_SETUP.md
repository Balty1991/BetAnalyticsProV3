# BSD MCP setup pentru BetAnalyticsProV3

## Ce este
BSD expune un server MCP separat de API-ul REST deja folosit în aplicație.

Link info primit: `https://sports.bzzoiro.com/mcp-info/`
Server MCP: `https://sports.bzzoiro.com/mcp`

## Important
Acest repo este o aplicație statică publicată pe GitHub Pages și un pipeline GitHub Actions care rulează scripturi Python.

Asta înseamnă:
- aplicația web din browser **nu poate consuma direct MCP** așa cum consumă un AI client compatibil;
- pentru site, varianta corectă rămâne **REST API + `BSD_TOKEN`**;
- pentru ChatGPT / Claude / Cursor / Gemini, MCP se configurează în clientul AI, nu în codul frontend din repo.

## Stadiul actual al repo-ului
Repo-ul are deja integrarea corectă pentru site:
- `fetch_data.py` trage date din BSD prin API REST;
- `.github/workflows/fetch-data.yml` rulează automat scripturile și actualizează datele locale din `data/`.

## Ce NU se poate face doar din repo
Nu pot activa din codul acestui repo un custom connector ChatGPT. Asta se face din setările clientului care suportă MCP.

## Ce poți face pentru ChatGPT
Dacă folosești un client ChatGPT care are suport pentru custom connectors / MCP, configurezi:

1. Settings
2. Connectors
3. Custom
4. Add MCP server
5. URL: `https://sports.bzzoiro.com/mcp`
6. Aprobi autentificarea

## Ce poți face pentru aplicația din repo
Pentru BetAnalyticsProV3 păstrezi arhitectura actuală:
- frontend static;
- GitHub Actions;
- Python fetchers;
- `BSD_TOKEN` în GitHub Secrets.

Dacă vrei în viitor o integrare MCP reală pentru produs, trebuie mutat proiectul pe o arhitectură cu backend / server care poate vorbi cu MCP și apoi expune datele procesate către frontend.

## Recomandare
Pentru acest repo:
- folosește în continuare REST pentru aplicație;
- folosește MCP doar pentru asistenți AI compatibili;
- nu amesteca MCP în frontend-ul public GitHub Pages fiindcă nu aduce beneficii și complică inutil fluxul.
