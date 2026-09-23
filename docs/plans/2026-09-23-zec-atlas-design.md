# ZEC Atlas — v0 design

Date: 2026-09-23
Status: approved (user), built

## Goal

A ZEC-denominated terminal + Zcash ecosystem directory that grows into the everyday ZEC superapp. v0 is one static page deployed from GitHub to Vercel.

## Audience

ZEC holders, traders, builders, and newcomers looking for the real, current map of the ecosystem (post-zcashd, 2026).

## Scope (v0)

Tabs: Terminal, Shielded, Feed, Directory.

1. Terminal — live ZEC price header, market facts, 7d sparkline, USD↔ZEC converter, "Priced in ZEC" table (BTC, ETH, SOL, USDT, USDC, PAXG, USD).
2. Shielded — live pool breakdown (CipherScan via Vercel rewrite) with ZecHub snapshots as fallback and 60-point shielded supply trend.
3. Feed — aggregated mentions: HN Algolia + Mastodon #zcash + Zcash Foundation blog.
4. Directory — ~160 curated listings across 13 categories with search, category chips, tags and outbound links.

## Architecture

Static files, no build: `index.html` (markup + meta + JSON-LD), `styles.css`, `app.js` (view logic, fetch/caching), `data/directory.js` (dataset). `vercel.json` adds the `/api/cipherscan/*` server-side proxy rewrite and cache headers. Session storage caching: prices 60s, chart 5m, shielded 5m, feed 10m.

## Naming decision

Research (domain + handle + collision check) recommended **ZEC Atlas / zecatlas.com**: all TLDs and handles clear, no ecosystem collisions, "atlas" matches the directory+mapping concept. Backups: zechq.com, pricedinzec.com (kept as tagline).

## Data decisions

- No CORS-friendly live shielded-pool API exists directly; CipherScan's API is live but Origin-gated, so it is proxied by the Vercel rewrite. ZecHub JSONs (CORS *) are the labeled, dated fallback.
- THORChain and SideShift do not support ZEC (verified) — excluded intentionally.
- zcashd is EOL (July 2026); Zebra/Zallet are the current stack — reflected in listings.

## SEO

Title/meta target "Zcash (ZEC) ecosystem directory", "priced in ZEC", wallet comparison intent. JSON-LD WebSite, canonical, sitemap, robots. Upgrade path: Astro SSG for indexable per-page content.

## Non-goals (v0)

No accounts, no alerts, no swap execution, no server-side storage, no per-page SEO.
