# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auckland Live is a real-time geospatial web dashboard visualizing public transport, aircraft, traffic flow, and weather over Auckland, NZ. Dark ATC/radar aesthetic, WebGL-accelerated rendering, all free-tier APIs.

**Current state (v1.2):** Fully functional. Deployable as a shared demo on one Cloudflare Worker (static assets + API proxy) with quota guards.

## Running Locally

Two terminals required:

```bash
# Terminal 1 — API proxy (CORS + key injection for AT and OpenSky)
node proxy.js

# Terminal 2 — static file server
npx serve .
```

Open `http://localhost:3000`. Config requires `config.local.js` (gitignored — copy from `config.local.example.js`).

## Architecture

### Stack
- **MapLibre GL JS v4** — basemap renderer. Two modes: LINZ aerial (raster, default) or MapTiler streets-v2 (vector, "Night"). Switched via `map.setStyle(..., { diff: false })`.
- **deck.gl v9** — `MapboxOverlay` on a separate canvas above MapLibre. Used for transport dots, aircraft dots, trail `PathLayer`s, and rain radar `BitmapLayer`.
- **TomTom Traffic Flow** — raster tiles added as a MapLibre layer (not deck.gl), re-added in `style.load` after every basemap switch.
- **Cloudflare Worker** (`worker/index.js`) — serves `dist/` as static assets and proxies AT and TomTom tiles in production. No flights in production (see Deploying).

### Data Layers & Polling

| Layer | Source | Interval | How |
|-------|--------|----------|-----|
| Public transport | AT GTFS-RT API | 10s local / 20s prod | Via proxy or Worker → deck.gl ScatterplotLayer |
| Aircraft | OpenSky ADS-B | 10s (local only) | Via proxy → deck.gl ScatterplotLayer. Hidden in prod |
| Traffic flow | TomTom raster tiles | Live | Direct locally, via Worker in prod → MapLibre raster layer |
| Rain radar | RainViewer | 10 min | Direct → deck.gl TileLayer + BitmapLayer |
| Weather HUD | Open-Meteo | 5 min | Direct → DOM |
| Aerial imagery | LINZ Basemaps | Static | Direct → MapLibre style |

### Key Architectural Patterns

**Basemap switching:** `map.setStyle(styleUrlOrObject, { diff: false })` — `{ diff: false }` is required to force a clean style replacement and ensure `style.load` fires reliably. Without it, MapLibre's diffing can leave custom-added sources/layers (like the traffic layer) in a broken state.

**`style.load` handler:** Used instead of `map.on('load', ...)` because it fires after every `setStyle()` call. An `_appStarted` flag prevents polling from being re-triggered on subsequent basemap switches. The handler re-adds the traffic layer and restores its visibility state on every style change.

**deck.gl overlay survives style changes:** `MapboxOverlay` is added as a map control (`map.addControl(overlay)`), not as a style layer. `setStyle()` only affects the MapLibre canvas — transport, aircraft, radar layers are completely unaffected by basemap switches.

**Trail fading:** Transport trails use time-based per-segment alpha. Each trail point stores `ts: Date.now()`. The `buildTransportTrailLayer` function computes age per segment and maps it to alpha (0 at 2 min old, 200 at fresh). `MAX_TRAIL_POINTS = 15` gives a 2.5 min buffer at 10s polling.

**AT speed cap:** `position.speed` is capped at 38.9 m/s (140 km/h) — AT's feed sometimes sends GPS Doppler spikes of 80–100 m/s.

**Map bounds:** `maxBounds` restricts panning to the NZ North Island (172.5–178.6°E, 41.7–34.3°S). `minZoom: 7` prevents zooming out to South Island. All live data is Auckland-only.

**Rain radar:** Uses `TileLayer` with `maxZoom: 6` (RainViewer's radar data resolution cap) and `renderSubLayers` returning a `BitmapLayer` per tile. `textureParameters: { minFilter: 'linear', magFilter: 'linear' }` on the BitmapLayer applies bilinear interpolation to smooth pixel edges. Colour scheme 6 (RAINBOW@SELEX-SI), smooth=1, snow=0. `fetchRadarInfo()` is called on init and every 10 min via `refreshRadar()`. Note: fog/cloud are not visible on rain radar — only precipitation shows.

**Liquid glass UI:** All panels use `backdrop-filter: blur(48px) saturate(180%) brightness(1.06)` with low-opacity backgrounds so map colours bleed through. A `::before` pseudo-element adds a refraction gradient. The detail panel uses the same recipe at `blur(56px)`. Do not replace with opaque backgrounds.

**Vehicle follow/track mode (`js/ui/tracker.js`):** Clicking a transport dot or aircraft enters follow mode. `startTracking(entity, type)` stores the tracked ID, calls `map.flyTo` (zoom ≥15), shows the tracker HUD, and places a `maplibregl.Marker` on the entity. `updateTracker(vehicles, aircraft)` is called after every poll — it re-centres via `map.easeTo` and refreshes the HUD. `stopTracking()` removes the marker and hides the HUD. The AT data quality info note (ⓘ button) is shown for transport only (`infoBtn.hidden = true` for aircraft); CSS `display: flex` overrides the `hidden` attribute so a `[hidden] { display: none }` rule is required. The bottom detail panel is suppressed while tracking — the tracker HUD carries all the same fields.

### File Structure

```
index.html
proxy.js                   # Local dev proxy (Node ESM, no npm deps)
wrangler.jsonc             # Worker config: assets=dist/, FeedCache DO, TTL/budget vars
worker/
  index.js                 # Production API proxy + FeedCache Durable Object
  limits.js                # Pure helpers: traffic tile bbox/zoom, budget day, TTL
scripts/
  build.mjs                # Allowlist copy → dist/ with public-keys-only config
package.json               # { "type": "module" } — enables ESM in Node
config.local.example.js    # Key template
config.local.js            # gitignored — real keys
js/
  main.js                  # Orchestrator: state, polling, style.load handler
  map-init.js              # MapLibre init, buildStreetsStyle, buildAerialStyle,
                           # removeHillshadeLayers, addTrafficLayer
  layers/
    transport.js           # AT fetch, ScatterplotLayer, fading PathLayer trails
    aircraft.js            # OpenSky fetch, ScatterplotLayer, PathLayer trails
    weather.js             # Open-Meteo fetch, RainViewer BitmapLayer
  ui/
    controls.js            # Checkbox toggles + basemap button pair
    detail-panel.js        # Slide-in bottom panel (suppressed during follow mode)
    hud.js                 # Weather HUD DOM updates
    tracker.js             # Vehicle follow mode: HUD, map.flyTo/easeTo, MapLibre marker callout
    idle.js                # Pauses polling + tour after 5 min without input
  utils/
    api-client.js          # Routes AT/OpenSky through proxy on localhost
    config.js              # Dynamic import of config.local.js
css/
  style.css
```

## Deploying

A single Cloudflare **Worker with static assets** (`wrangler.jsonc`). It serves `dist/` and handles `/api/*`:

- `/api/at/vehiclelocations` → `FeedCache` Durable Object (one global instance per feed name). It makes a single shared upstream fetch per TTL (`AT_TTL_S`=20), with a per-UTC-day upstream budget in DO storage. Failed fetches also wait out the TTL. Client query strings are ignored and upstream URLs are fixed server-side.
- **No flights feed in production.** OpenSky (auth server times out), adsb.lol (429) and adsb.fi (403) all refuse Cloudflare egress IPs; this was tested live on 2026-10-11. The build sets `FLIGHTS: false`, and `main.js` then hides every `[data-feature="flights"]` element, skips aircraft polling, and keeps transport visible on the Airport scene. Re-enabling flights needs a relay on a non-Cloudflare host or a paid ADS-B API.
- `/api/traffic/{z}/{x}/{y}.png` → TomTom, only for z10–15 inside the Auckland bbox (`worker/limits.js`). The `tiles` DO instance enforces `TILE_DAILY_BUDGET`; once it is spent, a transparent PNG is returned.
- The Cache API is a no-op on `workers.dev`, which is why the DO does all the caching.

**Build:** `scripts/build.mjs` uses an allowlist (`index.html`, `css/`, `js/`) → `dist/`, plus a generated `config.local.js` with only `MAPTILER_KEY`, `LINZ_API_KEY`, `TRAFFIC_PROXY: true` and `FLIGHTS: false`. The build fails if a server-only secret appears in `dist/`. Never point `assets.directory` at the repo root.

**Client-side quota guards:** `POLL_MS` in `api-client.js` is 10s locally and 20s in production to match the Worker TTL. `MotionStore` durations and briefing stale thresholds (3× poll) follow it. `js/ui/idle.js` pauses all polling and the scene tour after 5 min without input. The default basemap is LINZ aerial, so MapTiler (100k tiles/month) only loads when someone picks Night.

```bash
npx wrangler secret put AT_API_KEY   # + TOMTOM_API_KEY
npm run deploy                       # build + wrangler deploy
npm run dev:worker                   # local Worker; needs .dev.vars. Open http://[::1]:8787 (localhost uses proxy.js)
```

Live at https://ak-live.peter-mangin.workers.dev. LINZ and MapTiler keys are public in the browser; restrict MapTiler to the demo origin in its dashboard.
