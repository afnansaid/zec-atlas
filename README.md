# ZEC Atlas

Zcash (ZEC) ecosystem directory and price terminal in one static page — shielded-pool stats first, then live prices priced in ZEC, a searchable directory of every project, and an ecosystem feed.

## Stack

- Static: `index.html`, `styles.css`, `app.js`, `data/directory.js` — no build step.
- Fonts: Geist / Geist Mono (self-hosted variable woff2 in `fonts/`).
- Hosting: GitHub for source, Vercel for deploys (required for the CipherScan proxy rewrite in `vercel.json`).
- No keys, no backend, no framework.

## Live data sources

| Module | Source | Fallback |
| --- | --- | --- |
| Prices / converter | CoinGecko keyless markets API | Coinbase spot API |
| ZEC 7d sparkline | CoinGecko market_chart | — |
| Shielded pools (live) | CipherScan API via `/api/cipherscan/*` rewrite | ZecHub snapshot JSONs (direct CORS) |
| Pool flows (24h/7d/30d) | CipherScan `/pools/overview` via rewrite | — |
| Shielded tx/day | CipherScan `/stats/shielded-daily` via rewrite | — |
| Shielded history | ZecHub `shielded_supply.json` | — |
| Feed | Hacker News (Algolia), Mastodon #zcash, Zcash Foundation WP REST | — |

Notes:
- CipherScan enforces an Origin allowlist; the Vercel rewrite proxies it server-side so browsers never hit the gate. Locally, `npm run dev` runs an equivalent proxy. On GitHub Pages (no proxy) the shielded section falls back to dated ZecHub snapshots automatically.
- `data/directory.js` is the whole directory (166 projects). Adding one is one object.
- The "What matters now" strip (NU6.3 Ironwood, NU7 candidates, Sprout wind-down) is curated, dated copy — update it as the network moves.
- Update the canonical URL in `index.html`, `robots.txt` and `sitemap.xml` when the domain is final.

## Run locally

```bash
npm run dev
```

Serves at http://localhost:4173 with the CipherScan proxy enabled.

## Deploy

1. Push this folder to a GitHub repo (done: `afnansaid/zec-atlas`).
2. Import the repo on Vercel (framework preset: Other, no build command).
3. Point the domain at Vercel when ready.

## Roadmap

- Astro/SSG migration for per-page SEO (category pages, wallet comparisons).
- GitHub Action to snapshot ZecHub/CipherScan data daily for resilience.
- Ask CipherScan for an Origin allowlist entry (removes proxy dependence).
- Swap page (best route into shielded ZEC) once fee terms are confirmed.
