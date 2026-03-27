# Auckland Live

Real-time geospatial dashboard for Auckland — public transport, aircraft, and weather rendered over a vector basemap using MapLibre GL JS and deck.gl.

## Running locally

You need two terminals.

**Terminal 1 — API proxy** (handles CORS + injects API keys):
```bash
node proxy.js
```

**Terminal 2 — static file server:**
```bash
npx serve .
```

Then open `http://localhost:3000` (or whatever port `serve` picks).

## Config

Copy the example config and fill in your keys:

```bash
cp config.local.example.js config.local.js
```

```js
// config.local.js
export const CONFIG = {
  MAPTILER_KEY: '...',           // maptiler.com — free tier
  AT_API_KEY: '...',             // dev-portal.at.govt.nz — free
  OPENSKY_CLIENT_ID: '...',      // opensky-network.org — free account
  OPENSKY_CLIENT_SECRET: '...',
};
```

`config.local.js` is gitignored. Never commit it.

## API keys

| API | Where to get it | Cost |
|-----|----------------|------|
| MapTiler | [cloud.maptiler.com](https://cloud.maptiler.com) | Free (100k req/month) |
| Auckland Transport | [dev-portal.at.govt.nz](https://dev-portal.at.govt.nz) | Free |
| OpenSky Network | [opensky-network.org](https://opensky-network.org) | Free (4k credits/day authenticated) |
| Open-Meteo | — | No key needed |

## Architecture

```
Browser (MapLibre + deck.gl)
  ↓
proxy.js :3001          ← local dev only
  ├── /at/*      → api.at.govt.nz          (injects AT key)
  └── /opensky/* → opensky-network.org     (OAuth2 client credentials)

Open-Meteo → direct from browser (no auth)
```

The proxy is only needed locally. In production this is replaced by a Cloudflare Worker.

## Stack

- **[MapLibre GL JS v4](https://maplibre.org/)** — vector basemap (MapTiler streets-v2)
- **[deck.gl v9](https://deck.gl/)** — WebGL overlay for transport/aircraft layers
- **[RainViewer](https://www.rainviewer.com/api.html)** — rain radar tile (free, no key)
- **[Open-Meteo](https://open-meteo.com/)** — weather conditions (free, no key)
- Vanilla JS ES modules, no build step

## Data layers

| Layer | Source | Refresh |
|-------|--------|---------|
| Public transport | Auckland Transport GTFS-RT | 10s |
| Aircraft | OpenSky Network ADS-B | 10s |
| Rain radar | RainViewer | On load |
| Weather HUD | Open-Meteo | 5 min |

## What's built

- Live transport dots (blue=bus, orange=train, teal=ferry) with 60s trails
- Aircraft dots coloured by altitude (white→amber→green on ground)
- Click any vehicle or aircraft for detail panel
- Rain radar overlay (semi-transparent over the map)
- Weather HUD: temperature, conditions, wind, humidity
- Layer toggles

## What's not built yet

- Arrow/plane icons oriented by bearing (currently plain dots)
- 24h forecast strip
- Stale vehicle fade (>2 min old)
- Cloudflare Worker + Pages deployment
- Mobile responsive layout
