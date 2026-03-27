# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auckland Live is a real-time geospatial web dashboard visualizing public transport, aircraft, and weather over Auckland, NZ. It uses a dark ATC/radar aesthetic with WebGL-accelerated rendering.

**Current state:** PRD complete (`auckland-live-prd.md`), implementation pending.

## Running Locally

No build step or `npm install` required — vanilla ES modules served directly.

```bash
npx serve .
# or just open index.html in browser
```

For local dev with API keys, copy `config.local.example.js` → `config.local.js` and fill in keys (this file is gitignored).

## Deploying

**Cloudflare Pages** (static frontend, auto-deploys from Git):
```bash
# Set env var in Pages dashboard:
MAPTILER_KEY=<key>
```

**Cloudflare Worker** (API proxy at `worker/`):
```bash
npx wrangler deploy
npx wrangler secret put AT_API_KEY
npx wrangler secret put OPENSKY_CLIENT_ID
npx wrangler secret put OPENSKY_CLIENT_SECRET
```

## Architecture

### Stack
- **MapLibre GL JS v4+** — vector basemap (dark matter tiles from MapTiler)
- **deck.gl v9+** — WebGL overlay for thousands of moving entities
- **Cloudflare Workers** — edge proxy that injects API keys server-side
- **Cloudflare Pages** — static hosting

### Data Layers & Polling

| Layer | Source | Interval | Routing |
|-------|--------|----------|---------|
| Public transport | Auckland Transport GTFS-RT API | 10s | Via CF Worker (key injection) |
| Aircraft | OpenSky Network ADS-B | 10–15s | Via CF Worker (OAuth2) |
| Weather | Open-Meteo Forecast API | 5min | Direct (keyless) |

### Key Security Pattern

AT and OpenSky bearer tokens never reach the client — all proxied through the Cloudflare Worker. MapTiler key is domain-restricted and embedded in client code (standard for map tile APIs). Open-Meteo is called directly from the client (no key required).

### Expected File Structure

```
index.html
js/
  main.js              # App init, fetch scheduler
  map-init.js          # MapLibre setup (pitch 50°, bearing 160°, zoom 12, Victoria Park)
  layers/
    transport.js       # AT GTFS-RT visualization
    aircraft.js        # OpenSky visualization
    weather.js         # Open-Meteo visualization
  ui/
    controls.js        # Layer toggles, opacity/pitch sliders
    detail-panel.js    # Slide-in entity detail view
    hud.js             # Weather HUD + 24h forecast strip
  utils/
    animation.js       # Linear interpolation (lerp) between polled positions
    api-client.js      # Fetch routing (local keys vs. CF Worker proxy)
    config.js          # Config loading
css/
  style.css
config.local.example.js
config.local.js        # gitignored
worker/
  src/index.js         # CF Worker: route, proxy, inject auth headers
  wrangler.toml
```

### Animation Strategy

Entities animate smoothly between API polls using linear interpolation. Aircraft heading uses shortest-arc rotation (avoids spinning through 360°). Polling pauses when the page is backgrounded and resumes with an immediate refresh on foreground.

### Resilience

- Stale data shown with a warning badge ("⚠ Stale — last update 45s ago")
- MapTiler quota exhaustion: fallback to OSM raster tiles
- Last known positions persist if an API call errors
