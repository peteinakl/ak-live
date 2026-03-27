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
  LINZ_API_KEY: '...',           // basemaps.linz.govt.nz — free
};
```

`config.local.js` is gitignored. Never commit it.

## API keys

| API | Where to get it | Cost |
|-----|----------------|------|
| MapTiler | [cloud.maptiler.com](https://cloud.maptiler.com) | Free (100k req/month) |
| Auckland Transport | [dev-portal.at.govt.nz](https://dev-portal.at.govt.nz) | Free |
| OpenSky Network | [opensky-network.org](https://opensky-network.org) | Free (4k credits/day authenticated) |
| LINZ Basemaps | [basemaps.linz.govt.nz](https://basemaps.linz.govt.nz) | Free |
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

- **[MapLibre GL JS v4](https://maplibre.org/)** — vector basemap (MapTiler streets-v2) or LINZ aerial imagery
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

- Live transport dots (blue=bus, orange=train, teal=ferry) with 2-min fading trails
- Aircraft dots coloured by altitude (orange shades → green on ground)
- Click any vehicle or aircraft for detail panel
- Rain radar overlay (semi-transparent over the map)
- Weather HUD: temperature, conditions, wind, humidity
- Layer toggles
- Streets / Aerial basemap toggle (LINZ high-resolution orthophoto)

## Known data quality issues

- **AT speed data**: AT's GTFS-RT feed sometimes reports speed as the raw GPS Doppler value, which can spike to 80–100 m/s (~300 km/h) momentarily, especially as a bus pulls away from a stop. Speeds above 140 km/h are capped and shown as n/a.

## What's not built yet

- 24h forecast strip
- Cloudflare Worker + Pages deployment
- Mobile responsive layout
