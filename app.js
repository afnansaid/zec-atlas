(function () {
  "use strict";

  var DIRECTORY = window.ZEC_DIRECTORY || [];

  var CATEGORY_META = {
    wallets: { label: "Wallets", color: "#f4b728" },
    swaps: { label: "Swaps & Rails", color: "#34d399" },
    exchanges: { label: "Exchanges", color: "#60a5fa" },
    payments: { label: "Payments", color: "#f472b6" },
    infra: { label: "Infrastructure", color: "#22d3ee" },
    dev: { label: "Dev & SDKs", color: "#a78bfa" },
    primitives: { label: "Protocol Primitives", color: "#fb923c" },
    orgs: { label: "Organizations", color: "#94a3b8" },
    integrations: { label: "Link-ups", color: "#e879f9" },
    community: { label: "Community", color: "#4ade80" },
    media: { label: "Media", color: "#f87171" },
    events: { label: "Events & Calls", color: "#38bdf8" },
    grants: { label: "Grants & Bounties", color: "#fbbf24" }
  };

  var CATEGORY_ORDER = ["wallets", "swaps", "exchanges", "payments", "infra", "dev", "primitives", "orgs", "integrations", "community", "media", "events", "grants"];

  var ASSETS = [
    { id: "bitcoin", sym: "BTC", name: "Bitcoin", cb: "BTC" },
    { id: "ethereum", sym: "ETH", name: "Ethereum", cb: "ETH" },
    { id: "solana", sym: "SOL", name: "Solana", cb: "SOL" },
    { id: "tether", sym: "USDT", name: "Tether", cb: null },
    { id: "usd-coin", sym: "USDC", name: "USD Coin", cb: null },
    { id: "pax-gold", sym: "PAXG", name: "Gold (1 oz)", cb: null }
  ];

  var ZECHU_BASE = "https://zechub.wiki/data/zcash/";

  var POOL_COLORS = {
    sprout: "#94a3b8",
    sapling: "#a78bfa",
    orchard: "#f4b728",
    ironwood: "#34d399"
  };

  var state = {
    prices: null,
    priceSource: null,
    pricesAt: null,
    chart: null,
    chain: null,
    shieldedSource: null,
    shieldedAsOf: null,
    directoryCat: "all",
    directoryQuery: ""
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function cacheGet(key, ttlMs) {
    try {
      var raw = sessionStorage.getItem("zecatlas:" + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.t > ttlMs) return null;
      return obj.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    try { sessionStorage.setItem("zecatlas:" + key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) {}
  }

  function fetchJson(url, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function fmtUsd(n, opts) {
    if (!isFinite(n)) return "—";
    var d = opts && opts.compact;
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
      notation: d ? "compact" : "standard",
      maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 6
    }).format(n);
  }

  function fmtNum(n, digits) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits == null ? 2 : digits }).format(n);
  }

  function fmtZec(n) {
    if (!isFinite(n)) return "—";
    var digits = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.001 ? 4 : 8;
    return fmtNum(n, digits);
  }

  function fmtCompact(n) {
    if (!isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }

  function pct(n) {
    if (!isFinite(n)) return "—";
    return (n >= 0 ? "+" : "") + fmtNum(n, 2) + "%";
  }

  function relTime(input) {
    var d = new Date(input);
    if (isNaN(d)) return "";
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var days = Math.floor(h / 24);
    if (days < 31) return days + "d ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function seriesFrom(json) {
    if (Array.isArray(json)) {
      return json.map(function (item) {
        if (typeof item === "number") return { v: item };
        if (item && typeof item === "object") {
          var dateKey = Object.keys(item).find(function (k) { return /date|time|close/i.test(k) && typeof item[k] === "string"; });
          var valKey = Object.keys(item).find(function (k) { return /supply|value|total|close|amount|shielded/i.test(k) && typeof item[k] !== "string"; });
          if (!valKey) valKey = Object.keys(item).find(function (k) { return typeof item[k] === "number"; });
          var v = valKey ? Number(item[valKey]) : NaN;
          return isFinite(v) ? { t: dateKey ? String(item[dateKey]) : null, v: v } : null;
        }
        return null;
      }).filter(Boolean);
    }
    if (json && typeof json === "object") {
      var entries = Object.entries(json).filter(function (e) { return typeof e[1] === "number"; });
      var dated = entries.filter(function (e) { return /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(e[0]); });
      if (dated.length > 1) return dated.map(function (e) { return { t: e[0], v: e[1] }; });
      if (entries.length === 1) return [{ v: entries[0][1] }];
      var keys = Object.keys(json);
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(json[keys[i]]) && json[keys[i]].length) {
          var s = seriesFrom(json[keys[i]]);
          if (s.length) return s;
        }
      }
    }
    return [];
  }

  // ---------- Router ----------

  function setTab(tab) {
    var tabs = ["terminal", "shielded", "feed", "directory"];
    if (tabs.indexOf(tab) === -1) tab = "terminal";
    $$(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + tab); });
    document.body.dataset.tab = tab;
    if (window.history.replaceState) window.history.replaceState(null, "", "#" + tab);
    else location.hash = "#" + tab;
  }

  function initRouter() {
    $$(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.dataset.tab); });
    });
    var initial = (location.hash || "").replace("#", "").split("?")[0];
    setTab(initial || "terminal");
    window.addEventListener("hashchange", function () {
      var t = (location.hash || "").replace("#", "");
      if (t && document.body.dataset.tab !== t) setTab(t);
    });
  }

  // ---------- Terminal ----------

  function renderTicker() {
    var p = state.prices;
    var ticker = $("#ticker");
    if (!p || !p.zec) { ticker.textContent = "ZEC price unavailable"; ticker.classList.add("muted"); return; }
    ticker.classList.remove("muted");
    ticker.innerHTML = "";
    ticker.appendChild(el("span", "ticker-label", "ZEC"));
    ticker.appendChild(el("strong", "ticker-price", fmtUsd(p.zec.price)));
    var chg = el("span", "ticker-change " + (p.zec.change24h >= 0 ? "up" : "down"), pct(p.zec.change24h));
    ticker.appendChild(chg);
    ticker.appendChild(el("span", "ticker-meta", "priced in ZEC · " + (state.priceSource || "")));
  }

  function renderTerminal() {
    var p = state.prices;
    var hero = $("#terminal-hero");
    hero.innerHTML = "";
    if (!p || !p.zec) {
      hero.appendChild(el("p", "empty", "Could not load prices. Sources: CoinGecko / Coinbase API."));
      return;
    }
    var price = p.zec.price;

    var head = el("div", "hero-head");
    head.appendChild(el("span", "hero-sym", "ZEC / USD"));
    var big = el("div", "hero-price", fmtUsd(price));
    head.appendChild(big);
    var chg = el("span", "hero-change " + (p.zec.change24h >= 0 ? "up" : "down"), pct(p.zec.change24h) + " · 24h");
    head.appendChild(chg);
    hero.appendChild(head);

    var facts = el("div", "hero-facts");
    [
      ["Market cap", p.zec.marketCap ? "$" + fmtCompact(p.zec.marketCap) : "—"],
      ["Rank", p.zec.rank ? "#" + p.zec.rank : "—"],
      ["24h volume", p.zec.volume ? "$" + fmtCompact(p.zec.volume) : "—"],
      ["24h high", p.zec.high ? fmtUsd(p.zec.high) : "—"],
      ["24h low", p.zec.low ? fmtUsd(p.zec.low) : "—"],
      ["Updated", state.pricesAt ? relTime(state.pricesAt) : "—"]
    ].forEach(function (pair) {
      var f = el("div", "fact");
      f.appendChild(el("span", "fact-k", pair[0]));
      f.appendChild(el("span", "fact-v", pair[1]));
      facts.appendChild(f);
    });
    hero.appendChild(facts);

    var spark = $("#zec-spark");
    spark.innerHTML = "";
    if (state.chart && state.chart.length > 2) {
      spark.appendChild(sparkline(state.chart, 240, 64));
      var first = state.chart[0], last = state.chart[state.chart.length - 1];
      var delta = ((last - first) / first) * 100;
      spark.appendChild(el("span", "spark-label " + (delta >= 0 ? "up" : "down"), pct(delta) + " · 7d"));
    }

    var rows = $("#priced-rows");
    rows.innerHTML = "";

    var usdRow = pricedRow({ sym: "USD", name: "US dollar", zecPerUnit: 1 / price });
    usdRow.classList.add("base");
    rows.appendChild(usdRow);

    ASSETS.forEach(function (a) {
      var ap = p.assets[a.id];
      if (!ap) return;
      rows.appendChild(pricedRow({ sym: a.sym, name: a.name, zecPerUnit: ap / price }));
    });

    renderConverter();
  }

  function pricedRow(row) {
    var tr = el("div", "price-row");
    var left = el("div", "price-asset");
    left.appendChild(el("strong", null, row.sym));
    left.appendChild(el("span", "muted", row.name));
    tr.appendChild(left);
    var right = el("div", "price-zec");
    right.appendChild(el("span", "price-big", "1 " + row.sym + " = " + fmtZec(row.zecPerUnit) + " ZEC"));
    var perZec = row.zecPerUnit > 0 ? 1 / row.zecPerUnit : NaN;
    right.appendChild(el("span", "muted", "1 ZEC = " + fmtNum(perZec, perZec >= 1000 ? 0 : perZec >= 1 ? 2 : 6) + " " + row.sym));
    tr.appendChild(right);
    return tr;
  }

  function renderConverter() {
    var p = state.prices;
    if (!p || !p.zec) return;
    var note = $("#conv-note");
    if (note) note.textContent = fmtUsd(p.zec.price);
    var usdInput = $("#conv-usd");
    var zecInput = $("#conv-zec");
    if (usdInput.dataset.bound === "1") return;
    usdInput.dataset.bound = "1";
    var price = function () { return state.prices ? state.prices.zec.price : 0; };
    usdInput.addEventListener("input", function () {
      var v = parseFloat(usdInput.value);
      zecInput.value = isFinite(v) ? fmtZec(v / price()) : "";
    });
    zecInput.addEventListener("input", function () {
      var v = parseFloat(zecInput.value);
      usdInput.value = isFinite(v) ? fmtNum(v * price(), 2) : "";
    });
    usdInput.value = "100";
    zecInput.value = fmtZec(100 / price());
  }

  function sparkline(values, w, h) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min || 1;
    var step = w / (values.length - 1);
    var pts = values.map(function (v, i) {
      var x = i * step;
      var y = h - ((v - min) / range) * (h - 8) - 4;
      return [x, y];
    });
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(h));
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("spark");
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = line + " L " + w + " " + h + " L 0 " + h + " Z";
    var gradId = "sparkgrad";
    svg.innerHTML =
      '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#f4b728" stop-opacity=".35"/>' +
      '<stop offset="100%" stop-color="#f4b728" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gradId + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="#f4b728" stroke-width="2" stroke-linejoin="round"/>';
    return svg;
  }

  function loadPrices() {
    var cached = cacheGet("prices", 60000);
    if (cached) { state.prices = cached.prices; state.priceSource = cached.source; state.pricesAt = cached.at; renderTicker(); renderTerminal(); return Promise.resolve(); }

    var ids = ["zcash"].concat(ASSETS.map(function (a) { return a.id; })).join(",");
    var url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + ids + "&price_change_percentage=24h";
    return fetchJson(url).then(function (list) {
      var p = { zec: null, assets: {} };
      list.forEach(function (c) {
        var item = {
          price: c.current_price,
          change24h: c.price_change_percentage_24h,
          marketCap: c.market_cap,
          volume: c.total_volume,
          rank: c.market_cap_rank,
          high: c.high_24h,
          low: c.low_24h
        };
        if (c.id === "zcash") p.zec = item;
        else p.assets[c.id] = c.current_price;
      });
      if (!p.zec) throw new Error("ZEC missing");
      state.prices = p;
      state.priceSource = "CoinGecko";
      state.pricesAt = Date.now();
      cacheSet("prices", { prices: p, source: "CoinGecko", at: state.pricesAt });
      renderTicker();
      renderTerminal();
    }).catch(function () {
      return loadPricesFallback();
    });
  }

  function loadPricesFallback() {
    return fetchJson("https://api.coinbase.com/v2/prices/ZEC-USD/spot").then(function (r) {
      var zec = parseFloat(r.data.amount);
      var p = { zec: { price: zec, change24h: NaN, marketCap: NaN, volume: NaN, rank: NaN, high: NaN, low: NaN }, assets: {} };
      var jobs = ASSETS.map(function (a) {
        if (!a.cb) { p.assets[a.id] = 1; return Promise.resolve(); }
        return fetchJson("https://api.coinbase.com/v2/prices/" + a.cb + "-USD/spot")
          .then(function (rr) { p.assets[a.id] = parseFloat(rr.data.amount); })
          .catch(function () {});
      });
      return Promise.all(jobs).then(function () {
        state.prices = p;
        state.priceSource = "Coinbase";
        state.pricesAt = Date.now();
        renderTicker();
        renderTerminal();
      });
    }).catch(function () {
      renderTicker();
      renderTerminal();
    });
  }

  function loadChart() {
    var cached = cacheGet("chart", 300000);
    if (cached) { state.chart = cached; return Promise.resolve(); }
    return fetchJson("https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=7&interval=daily")
      .then(function (r) {
        state.chart = r.prices.map(function (pt) { return pt[1]; });
        cacheSet("chart", state.chart);
      }).catch(function () {});
  }

  // ---------- Shielded ----------

  function renderShielded() {
    var donutBox = $("#donut");
    var tiles = $("#shield-tiles");
    var trend = $("#shield-trend");
    donutBox.innerHTML = "";
    tiles.innerHTML = "";
    trend.innerHTML = "";

    var chain = state.chain;
    if (!chain) {
      var msg = el("p", "empty");
      if (state.shieldHistory && state.shieldHistory.length) {
        msg.appendChild(document.createTextNode("Live pool breakdown needs this site deployed on Vercel (CipherScan proxy). Showing dated ZecHub snapshots instead — "));
      } else {
        msg.appendChild(document.createTextNode("Live pool data unavailable (needs this site deployed on Vercel, or CipherScan to allowlist our origin). "));
      }
      var link = el("a", null, "CipherScan");
      link.href = "https://cipherscan.app";
      link.target = "_blank";
      link.rel = "noopener";
      msg.appendChild(link);
      msg.appendChild(document.createTextNode(" is the live source."));
      donutBox.appendChild(msg);

      if (state.shieldHistory && state.shieldHistory.length) {
        var latestShield = state.shieldHistory[state.shieldHistory.length - 1];
        var snap = [["Shielded (snapshot)", fmtNum(latestShield, 0) + " ZEC"]];
        if (state.shieldTotal) {
          snap.push(["Total supply (snapshot)", fmtNum(state.shieldTotal, 0) + " ZEC"]);
          snap.push(["Shielded share", fmtNum((latestShield / state.shieldTotal) * 100, 1) + "%"]);
        }
        snap.push(["Source", "ZecHub snapshots"]);
        snap.forEach(function (pair) {
          var t = el("div", "tile");
          t.appendChild(el("span", "tile-k", pair[0]));
          t.appendChild(el("span", "tile-v", pair[1]));
          tiles.appendChild(t);
        });
      }
    } else {
      var pools = chain.pools;
      var shieldedPools = pools.filter(function (p) { return p.name !== "transparent" && p.name !== "lockbox"; });
      var shielded = shieldedPools.reduce(function (s, p) { return s + p.value; }, 0);
      var transparent = (pools.find(function (p) { return p.name === "transparent"; }) || {}).value || 0;
      var total = shielded + transparent || 1;
      var lockbox = (pools.find(function (p) { return p.name === "lockbox"; }) || {}).value || 0;

      var shares = shieldedPools.map(function (p) {
        return { name: p.name, value: p.value, pct: (p.value / total) * 100 };
      }).filter(function (p) { return p.pct > 0.05; });
      var transparentPct = 100 - shares.reduce(function (s, p) { return s + p.pct; }, 0);

      donutBox.appendChild(donut(shares, transparentPct, total));

      var legend = el("div", "legend");
      shares.forEach(function (p) {
        var row = el("div", "legend-row");
        var swatch = el("span", "swatch");
        swatch.style.background = poolColor(p.name);
        row.appendChild(swatch);
        row.appendChild(el("span", "legend-name", cap(p.name)));
        row.appendChild(el("span", "legend-val", fmtZec(p.value) + " ZEC"));
        row.appendChild(el("span", "legend-pct muted", fmtNum(p.pct, 1) + "%"));
        legend.appendChild(row);
      });
      var trC = el("div", "legend-row");
      var sw = el("span", "swatch");
      sw.style.background = "#3f3f46";
      trC.appendChild(sw);
      trC.appendChild(el("span", "legend-name", "Transparent"));
      trC.appendChild(el("span", "legend-val", fmtZec(transparent) + " ZEC"));
      trC.appendChild(el("span", "legend-pct muted", fmtNum(transparentPct, 1) + "%"));
      legend.appendChild(trC);
      donutBox.appendChild(legend);

      [
        ["Total supply", fmtNum(total, 0) + " ZEC"],
        ["Shielded", fmtNum(shielded, 0) + " ZEC"],
        ["Shielded share", fmtNum((shielded / total) * 100, 1) + "%"],
        ["Lockbox", fmtNum(lockbox, 0) + " ZEC"],
        ["Block height", state.chain.height ? fmtNum(state.chain.height, 0) : "—"],
        ["Difficulty", state.chain.difficulty ? fmtCompact(state.chain.difficulty) : "—"]
      ].forEach(function (pair) {
        var t = el("div", "tile");
        t.appendChild(el("span", "tile-k", pair[0]));
        t.appendChild(el("span", "tile-v", pair[1]));
        tiles.appendChild(t);
      });
    }

    var asOf = $("#shield-asof");
    asOf.textContent = state.shieldedSource
      ? state.shieldedSource + (state.shieldedAsOf ? " · as of " + state.shieldedAsOf : "")
      : "";

    if (state.shieldHistory && state.shieldHistory.length > 2) {
      var vals = state.shieldHistory;
      trend.appendChild(el("h3", null, "Shielded ZEC supply"));
      trend.appendChild(sparkline(vals, 720, 120));
      var oldest = vals[0], latest = vals[vals.length - 1];
      var growth = ((latest - oldest) / oldest) * 100;
      trend.appendChild(el("p", "muted", fmtNum(latest, 0) + " ZEC shielded · " + pct(growth) + " over the shown window · source: ZecHub snapshots"));
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function poolColor(name) {
    return POOL_COLORS[name] || "#71717a";
  }

  function donut(shares, transparentPct, total) {
    var start = 0;
    var parts = shares.map(function (p) {
      p.start = start;
      start += p.pct;
      return poolColor(p.name) + " " + p.start.toFixed(2) + "% " + (p.start + p.pct).toFixed(2) + "%";
    });
    if (transparentPct > 0.05) parts.push("#3f3f46 " + start.toFixed(2) + "% 100%");
    var wrap = el("div", "donut-wrap");
    var d = el("div", "donut");
    d.style.background = "conic-gradient(" + parts.join(",") + ")";
    var hole = el("div", "donut-hole");
    hole.appendChild(el("span", "donut-big", fmtNum(((total - shares.reduce(function (s, p) { return s + p.value; }, 0)) / total) * 100, 0) + "%"));
    hole.appendChild(el("span", "donut-small", "transparent"));
    d.appendChild(hole);
    wrap.appendChild(d);
    return wrap;
  }

  function loadShielded() {
    var cached = cacheGet("shielded", 300000);
    if (cached) {
      state.chain = cached.chain;
      state.shieldedSource = cached.source;
      state.shieldedAsOf = cached.asOf;
      state.shieldHistory = cached.history || null;
      state.shieldTotal = cached.total || null;
      renderShielded();
      return Promise.resolve();
    }

    var chainPromise = fetchJson("/api/cipherscan/blockchain-info", 12000).then(function (info) {
      var pools = (info.valuePools || []).map(function (p) {
        var name = p.pool || p.id || p.name || "unknown";
        var value = poolValue(p);
        return { name: String(name).toLowerCase(), value: value };
      }).filter(function (p) { return isFinite(p.value) && p.value > 0; });
      if (!pools.length) throw new Error("no pools");
      return {
        pools: pools,
        height: info.blocks || info.bestblockheight,
        difficulty: info.difficulty
      };
    }).catch(function () { return null; });

    var historyPromise = Promise.all([
      fetchJson(ZECHU_BASE + "shielded_supply.json", 12000),
      fetchJson(ZECHU_BASE + "total_supply.json", 12000).catch(function () { return null; })
    ]).then(function (res) {
      var series = seriesFrom(res[0]);
      if (series.length < 3) return null;
      var recent = series.slice(-60);
      var totalSeries = res[1] ? seriesFrom(res[1]) : [];
      return {
        values: recent.map(function (p) { return p.v; }),
        asOf: recent[recent.length - 1].t || null,
        total: totalSeries.length ? totalSeries[totalSeries.length - 1].v : null
      };
    }).catch(function () { return null; });

    return Promise.all([chainPromise, historyPromise]).then(function (res) {
      var chain = res[0];
      var hist = res[1];
      state.chain = chain;
      state.shieldHistory = hist ? hist.values : null;
      state.shieldTotal = hist ? hist.total : null;
      if (chain) state.shieldedSource = "CipherScan (live)";
      else if (hist) state.shieldedSource = "ZecHub";
      state.shieldedAsOf = hist && hist.asOf ? hist.asOf : null;
      if (chain || hist) {
        cacheSet("shielded", {
          chain: chain,
          source: state.shieldedSource,
          asOf: state.shieldedAsOf,
          history: state.shieldHistory,
          total: state.shieldTotal
        });
      }
      renderShielded();
    });
  }

  function poolValue(p) {
    if (typeof p.chainValue === "number") return p.chainValue;
    if (typeof p.valueZat === "number") return p.valueZat / 1e8;
    if (typeof p.value === "number") return p.value > 1e6 ? p.value / 1e8 : p.value;
    if (typeof p.zats === "number") return p.zats / 1e8;
    return NaN;
  }

  // ---------- Feed ----------

  function stripHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").trim();
  }

  function loadFeed() {
    var cached = cacheGet("feed", 600000);
    if (cached) { renderFeed(cached); return Promise.resolve(); }

    var hn = fetchJson("https://hn.algolia.com/api/v1/search_by_date?query=zcash&tags=story&hitsPerPage=20")
      .then(function (r) {
        return (r.hits || []).map(function (h) {
          return {
            title: h.title,
            url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID),
            date: h.created_at,
            source: "Hacker News",
            meta: h.points + " points · " + h.num_comments + " comments"
          };
        });
      }).catch(function () { return []; });

    var mastodon = fetchJson("https://mastodon.social/api/v1/timelines/tag/zcash?limit=15")
      .then(function (posts) {
        return (posts || []).map(function (p) {
          var text = stripHtml(p.content || "");
          return {
            title: text.length > 140 ? text.slice(0, 137) + "…" : text,
            url: p.url,
            date: p.created_at,
            source: "Mastodon",
            meta: "@" + (p.account && p.account.acct ? p.account.acct : "mastodon")
          };
        }).filter(function (p) { return p.title; });
      }).catch(function () { return []; });

    var zf = fetchJson("https://zfnd.org/wp-json/wp/v2/posts?per_page=8&_fields=title,link,date,excerpt")
      .then(function (posts) {
        return (posts || []).map(function (p) {
          return {
            title: stripHtml(p.title && p.title.rendered ? p.title.rendered : ""),
            url: p.link,
            date: p.date,
            source: "Zcash Foundation",
            meta: stripHtml(p.excerpt && p.excerpt.rendered ? p.excerpt.rendered : "").slice(0, 120)
          };
        });
      }).catch(function () { return []; });

    return Promise.all([hn, mastodon, zf]).then(function (lists) {
      var items = lists.reduce(function (acc, l) { return acc.concat(l); }, []);
      items.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      var top = items.slice(0, 40);
      if (top.length) cacheSet("feed", top);
      renderFeed(top);
    });
  }

  function renderFeed(items) {
    var box = $("#feed-list");
    box.innerHTML = "";
    if (!items.length) {
      box.appendChild(el("p", "empty", "Feed unavailable right now. Try again shortly."));
      return;
    }
    items.forEach(function (item) {
      var a = el("a", "feed-item");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener";
      var top = el("div", "feed-top");
      top.appendChild(el("span", "feed-source", item.source));
      top.appendChild(el("span", "feed-date muted", relTime(item.date)));
      a.appendChild(top);
      a.appendChild(el("h3", "feed-title", item.title));
      if (item.meta) a.appendChild(el("p", "feed-meta muted", item.meta));
      box.appendChild(a);
    });
  }

  // ---------- Directory ----------

  function renderDirectory() {
    var chips = $("#dir-chips");
    chips.innerHTML = "";
    var counts = { all: DIRECTORY.length };
    DIRECTORY.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });

    function chip(key, label) {
      var b = el("button", "chip" + (state.directoryCat === key ? " active" : ""));
      if (key !== "all" && CATEGORY_META[key]) {
        var dot = el("span", "chip-dot");
        dot.style.background = CATEGORY_META[key].color;
        b.appendChild(dot);
      }
      b.appendChild(el("span", null, label));
      b.appendChild(el("span", "chip-count", String(counts[key] || 0)));
      b.addEventListener("click", function () {
        state.directoryCat = key;
        renderDirectory();
      });
      return b;
    }

    chips.appendChild(chip("all", "Everything"));
    CATEGORY_ORDER.forEach(function (key) {
      if (!counts[key]) return;
      chips.appendChild(chip(key, CATEGORY_META[key].label));
    });

    var q = state.directoryQuery.trim().toLowerCase();
    var results = DIRECTORY.filter(function (e) {
      if (state.directoryCat !== "all" && e.category !== state.directoryCat) return false;
      if (!q) return true;
      var hay = [e.name, e.blurb, (e.tags || []).join(" "), e.category].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var list = $("#dir-list");
    list.innerHTML = "";
    var count = $("#dir-count");
    count.textContent = results.length + " of " + DIRECTORY.length + " projects";

    if (!results.length) {
      list.appendChild(el("p", "empty", "Nothing matches that search."));
      return;
    }

    results.forEach(function (e) {
      var meta = CATEGORY_META[e.category] || { label: e.category, color: "#71717a" };
      var card = el("article", "card");
      var head = el("div", "card-head");
      var dot = el("span", "dot");
      dot.style.background = meta.color;
      head.appendChild(dot);
      var h3 = el("h3", "card-name");
      var link = el("a", null, e.name);
      link.href = e.url;
      link.target = "_blank";
      link.rel = "noopener";
      h3.appendChild(link);
      head.appendChild(h3);
      head.appendChild(el("span", "card-cat", meta.label));
      card.appendChild(head);
      card.appendChild(el("p", "card-blurb", e.blurb));
      if (e.tags && e.tags.length) {
        var tags = el("div", "card-tags");
        e.tags.forEach(function (t) { tags.appendChild(el("span", "tag", t)); });
        card.appendChild(tags);
      }
      if (e.note) card.appendChild(el("p", "card-note muted", e.note));
      var links = el("div", "card-links");
      links.appendChild(extLink(e.url, "site"));
      if (e.links) {
        if (e.links.x) links.appendChild(extLink(e.links.x, "X"));
        if (e.links.github) links.appendChild(extLink(e.links.github, "github"));
        if (e.links.docs) links.appendChild(extLink(e.links.docs, "docs"));
        if (e.links.forum) links.appendChild(extLink(e.links.forum, "forum"));
      }
      card.appendChild(links);
      list.appendChild(card);
    });
  }

  function extLink(href, label) {
    var a = el("a", "ext-link", label);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function initDirectory() {
    var input = $("#dir-search");
    input.addEventListener("input", function () {
      state.directoryQuery = input.value || "";
      renderDirectory();
    });
    renderDirectory();
  }

  // ---------- Boot ----------

  function bootFooter() {
    $("#year").textContent = String(new Date().getFullYear());
  }

  document.addEventListener("DOMContentLoaded", function () {
    initRouter();
    initDirectory();
    bootFooter();
    loadPrices();
    loadChart().then(renderTerminal);
    loadShielded();
    loadFeed();
  });
})();
