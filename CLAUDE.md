# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auckland Live is a real-time geospatial web dashboard visualizing public transport, aircraft, traffic flow, and weather over Auckland, NZ. Dark ATC/radar aesthetic, WebGL-accelerated rendering, all free-tier APIs.

**Current state:** Fully functional local MVP. Cloudflare Worker + Pages deployment not yet done.

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
- **MapLibre GL JS v4** — basemap renderer. Two modes: MapTiler streets-v2 (vector) or LINZ aerial (raster). Switched via `map.setStyle(..., { diff: false })`.
- **deck.gl v9** — `MapboxOverlay` on a separate canvas above MapLibre. Used for transport dots, aircraft dots, trail `PathLayer`s, and rain radar `BitmapLayer`.
- **TomTom Traffic Flow** — raster tiles added as a MapLibre layer (not deck.gl), re-added in `style.load` after every basemap switch.
- **Cloudflare Worker** (not yet deployed) — will proxy AT and OpenSky in production.

### Data Layers & Polling

| Layer | Source | Interval | How |
|-------|--------|----------|-----|
| Public transport | AT GTFS-RT API | 10s | Via proxy → deck.gl ScatterplotLayer |
| Aircraft | OpenSky ADS-B | 10s | Via proxy → deck.gl ScatterplotLayer |
| Traffic flow | TomTom raster tiles | Live | Direct → MapLibre raster layer |
| Rain radar | RainViewer | On load | Direct → deck.gl BitmapLayer |
| Weather HUD | Open-Meteo | 5 min | Direct → DOM |
| Aerial imagery | LINZ Basemaps | Static | Direct → MapLibre style |

### Key Architectural Patterns

**Basemap switching:** `map.setStyle(styleUrlOrObject, { diff: false })` — `{ diff: false }` is required to force a clean style replacement and ensure `style.load` fires reliably. Without it, MapLibre's diffing can leave custom-added sources/layers (like the traffic layer) in a broken state.

**`style.load` handler:** Used instead of `map.on('load', ...)` because it fires after every `setStyle()` call. An `_appStarted` flag prevents polling from being re-triggered on subsequent basemap switches. The handler re-adds the traffic layer and restores its visibility state on every style change.

**deck.gl overlay survives style changes:** `MapboxOverlay` is added as a map control (`map.addControl(overlay)`), not as a style layer. `setStyle()` only affects the MapLibre canvas — transport, aircraft, radar layers are completely unaffected by basemap switches.

**Trail fading:** Transport trails use time-based per-segment alpha. Each trail point stores `ts: Date.now()`. The `buildTransportTrailLayer` function computes age per segment and maps it to alpha (0 at 2 min old, 200 at fresh). `MAX_TRAIL_POINTS = 15` gives a 2.5 min buffer at 10s polling.

**AT speed cap:** `position.speed` is capped at 38.9 m/s (140 km/h) — AT's feed sometimes sends GPS Doppler spikes of 80–100 m/s.

### File Structure

```
index.html
proxy.js                   # Local dev proxy (Node ESM, no npm deps)
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
    detail-panel.js        # Slide-in panel for clicked vehicles/aircraft
    hud.js                 # Weather HUD DOM updates
  utils/
    api-client.js          # Routes AT/OpenSky through proxy on localhost
    config.js              # Dynamic import of config.local.js
css/
  style.css
```

## Deploying (not yet done)

**Cloudflare Pages** — static frontend, auto-deploys from Git.

**Cloudflare Worker** (`worker/` — not yet created):
```bash
npx wrangler deploy
npx wrangler secret put AT_API_KEY
npx wrangler secret put OPENSKY_CLIENT_ID
npx wrangler secret put OPENSKY_CLIENT_SECRET
```

LINZ, TomTom, and MapTiler keys are safe to embed in client JS (all are domain-restricted or tile-URL-bound).
