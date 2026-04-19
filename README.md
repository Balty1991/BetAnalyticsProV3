# BetAnalyticsPro

Analyst

## BSD integration

Aplicația folosește BSD prin fluxul existent din repo:
- `fetch_data.py`
- `.github/workflows/fetch-data.yml`
- `BSD_TOKEN` în GitHub Secrets

## BSD MCP

Am adăugat explicațiile în `BSD_MCP_SETUP.md`.

Pe scurt:
- pentru aplicația publicată pe GitHub Pages rămâne corectă integrarea prin API REST;
- MCP-ul BSD este pentru clienți AI compatibili, nu pentru frontend static;
- configurarea MCP pentru ChatGPT / Claude / Cursor se face în client, nu direct în codul repo-ului.
