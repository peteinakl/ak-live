# Auckland Live — Real-Time Geospatial Dashboard

## Product Requirements Document

**Version:** 1.1
**Date:** 27 March 2026
**Status:** Draft

---

## 1. Purpose

A single-page web application that renders a real-time, animated view of Auckland on a dark vector basemap. Three live data layers — public transport vehicles, aircraft, and weather — are overlaid to create an immersive GIS-style dashboard. The goal is a visually striking, always-updating window into the city that runs entirely on free and open data sources.

## 2. Design Principles

- **Dark-first aesthetic.** The basemap is dark; all data layers use bright, high-contrast colours against it. The visual language borrows from air-traffic control displays and maritime radar — functional, information-dense, cinematic.
- **Real-time by default.** Every layer auto-refreshes on its own cadence. No user action needed to keep data current.
- **Zero cost at rest.** All APIs used are free-tier or keyless. The app can be deployed publicly without running costs.
- **Keys never reach the client.** All authenticated API calls are proxied through a serverless edge function. API keys live in environment variables on the server, never in shipped JavaScript.
- **Progressive disclosure.** The map loads fast with the basemap and weather first, then populates transport and flight dots as those feeds respond. Click any moving object to get detail.

## 3. Technical Stack

| Component | Choice | Rationale |
|---|---|---|
| **Map renderer** | MapLibre GL JS (v4+) | Open-source Mapbox GL fork. Handles vector tiles, 3D pitch/bearing, smooth animation. Large ecosystem. |
| **Overlay renderer** | deck.gl (v9+) | WebGL-accelerated layers for thousands of animated points. IconLayer for vehicles/aircraft, ScatterplotLayer for weather stations. Integrates natively with MapLibre. |
| **Basemap tiles** | MapTiler "Dark Matter" style | Free tier: 100k API requests/month, 5k map sessions/month. Dark vector basemap with excellent label hierarchy. Requires free API key. |
| **API proxy** | Cloudflare Worker | Free tier: 100k requests/day. Holds API keys server-side, proxies AT and OpenSky requests. Adds CORS headers. |
| **Framework** | Single HTML file (vanilla JS + ES modules) | Keeps build tooling to zero. Can be upgraded to React/Vite later if needed. |
| **Hosting** | Cloudflare Pages (static) | Free tier. Automatic deploys from Git. Custom domain support. Workers integrate natively. |

## 4. Data Layers

### 4.1 Public Transport — Auckland Transport GTFS Realtime

**Source:** Auckland Transport Developer Portal
**URL:** `https://api.at.govt.nz/realtime/legacy/vehiclelocations`
**Auth:** Free API key (register at dev-portal.at.govt.nz)
**Licence:** Creative Commons Attribution 4.0 International
**Format:** JSON (also supports protobuf via Accept header)
**Refresh cadence:** Every 10 seconds (feed updates at least every 30s; polling at 10s keeps it responsive)

**Data available per vehicle:**

- Vehicle ID, route ID, trip ID
- Latitude / longitude
- Bearing (heading)
- Timestamp
- Occupancy status (where available)

**Rendering:**

- Each vehicle rendered as an arrow-shaped icon oriented by bearing
- Colour-coded by mode: bus (blue), train (orange), ferry (teal)
- On hover: tooltip showing route number, destination, delay status
- On click: expanded panel with trip detail, next stops, occupancy
- Trail effect: faint line behind each vehicle showing last 60 seconds of movement

**Edge cases:**

- Vehicles with stale timestamps (>2 min old) rendered at 50% opacity
- Vehicles outside the Auckland bounding box filtered out
- GTFS static schedule data loaded once at startup (routes, stops, shapes) for context

### 4.2 Aircraft — OpenSky Network ADS-B

**Source:** OpenSky Network REST API
**URL:** `https://opensky-network.org/api/states/all?lamin=-37.1&lomin=174.5&lamax=-36.6&lomax=175.1`
**Auth:** Free account recommended (anonymous: 400 credits/day, 10s resolution; authenticated: 4,000 credits/day, 5s resolution). OAuth2 client credentials flow — basic auth deprecated March 2026.
**Licence:** Open, attribution requested
**Format:** JSON
**Refresh cadence:** Every 10 seconds (authenticated) or every 15 seconds (anonymous, to conserve credits)

**Data available per aircraft:**

- ICAO24 transponder address
- Callsign
- Origin country
- Latitude / longitude
- Barometric altitude (metres)
- Velocity (m/s) and heading (degrees)
- Vertical rate
- On-ground flag

**Rendering:**

- Aircraft rendered as plane icons, sized by altitude (larger = closer to ground, more visually prominent near Auckland Airport)
- Icon rotated to heading
- Colour gradient: white (cruising, >8000m) → amber (descending) → green (on approach/ground)
- Altitude label beside each icon
- On hover: callsign, altitude, speed, origin country
- On click: expanded panel with full state vector
- Aircraft on ground (at Auckland Airport) rendered as static dots in a distinct colour

**Bounding box:** The API query uses a box roughly covering the upper North Island / Hauraki Gulf region to capture approach traffic, not just aircraft directly over the CBD.

### 4.3 Weather — Open-Meteo

**Source:** Open-Meteo Forecast API
**URL:** `https://api.open-meteo.com/v1/forecast?latitude=-36.85&longitude=174.76&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover,pressure_msl&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code&timezone=Pacific/Auckland`
**Auth:** None required (fully keyless)
**Licence:** Open, free for non-commercial use
**Format:** JSON
**Refresh cadence:** Every 5 minutes (weather doesn't change fast enough to justify more)

**Data used:**

- Current conditions: temperature, humidity, wind speed/direction, weather code, cloud cover, pressure
- Hourly forecast: 24-hour lookahead for temperature, precipitation probability, wind

**Rendering:**

- **Weather HUD:** Fixed overlay panel (top-left or bottom-left) showing current conditions with weather icon derived from WMO weather code
- **Wind indicator:** Animated wind arrow on the map showing current direction and speed. Optionally, a subtle particle-flow animation across the map surface indicating wind direction.
- **Colour wash (optional, toggle-able):** Light semi-transparent gradient across the map tinted by temperature (blue = cool, amber = warm) or precipitation probability (blue tint where rain expected)
- **Forecast strip:** Horizontal mini-chart at bottom of screen showing 24h temperature and precipitation probability timeline

## 5. User Interface

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Weather HUD]                          [Layer Controls] │
│  16°C ☁ Wind 12km/h SW                  ☑ Transport     │
│  Humidity 72%                            ☑ Flights       │
│                                          ☑ Weather       │
│                                          ─────────────   │
│                                          Pitch: [slider] │
│                                                          │
│                    AUCKLAND MAP                          │
│              (dark basemap, 3D pitch)                    │
│                                                          │
│         🚌 ✈ 🚌     ✈                                   │
│                  ⛴                                       │
│                       🚌                                 │
│                                                          │
│   [Detail Panel - appears on click]                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ▸ 24h Forecast Strip: temp + precip probability         │
│  14° 15° 16° 16° 15° 14° 13° ...    🌧 20% 35% 60% ... │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Initial View

- **Centre:** Above Victoria Park Market (-36.8438, 174.7570) — places the Harbour Bridge, Viaduct, and Wynyard Quarter in the foreground with the CBD skyline behind when pitched
- **Zoom:** 12 (tight enough to see individual streets and the harbour, wide enough to capture Devonport, Birkenhead, and the inner Waitematā)
- **Pitch:** 50° (tilted 3D view — looking south-east across the harbour toward the CBD gives the best depth effect with water in the foreground)
- **Bearing:** 160° (rotated so the view looks roughly south-east, framing the Sky Tower and CBD behind the harbour — more cinematic than north-up)
- User can freely pan, rotate, and zoom from this starting position

### 5.3 Layer Controls

Floating panel (top-right) with toggle switches for each layer. Each toggle shows a count of active entities (e.g., "Transport: 847 vehicles", "Flights: 12 aircraft"). Layer controls also expose per-layer opacity slider.

### 5.4 Detail Panel

Appears on click of any entity. Slides in from the left or bottom. Shows structured data for the selected vehicle/aircraft. Dismissed by clicking elsewhere or pressing Escape.

### 5.5 Responsiveness

Desktop-first. On viewports below 768px, the forecast strip collapses to an expandable drawer, and the layer controls move behind a hamburger toggle. The map itself remains full-bleed at all breakpoints.

## 6. Performance Requirements

| Metric | Target |
|---|---|
| Initial load (map visible) | < 2 seconds on broadband |
| Time to first data overlay | < 4 seconds |
| Frame rate during animation | 60 fps with < 1,000 entities; 30+ fps with 2,000+ |
| Memory usage | < 200 MB in steady state |
| API request budget (daily) | < 3,000 OpenSky credits; < 2,000 MapTiler sessions; unlimited Open-Meteo |

## 7. Deployment & API Key Security

The app must be publicly accessible without exposing any API keys or auth tokens in client-side code. This is achieved through a layered approach: some APIs support domain-restricted keys, others are proxied through a serverless edge function, and one needs no key at all.

### 7.1 Key Security Strategy Per API

| API | Strategy | Why |
|---|---|---|
| **MapTiler** | Domain-restricted key, embedded in client JS | MapTiler supports HTTP referrer restrictions. The key only works from your domain (e.g., `auckland.live`). Even if someone reads the key from source, it's useless elsewhere. This is the standard pattern for map tile keys. |
| **Auckland Transport** | Proxied through Cloudflare Worker | AT API keys are unrestricted bearer tokens — anyone with the key can use it from any origin. Must not appear in client code. The Worker holds the key in an environment variable and proxies requests. |
| **OpenSky Network** | Proxied through Cloudflare Worker (if authenticated) | OAuth2 client credentials must stay server-side. If using anonymous access only, no proxy needed — but the Worker lets you use authenticated rates without exposing credentials. |
| **Open-Meteo** | Direct from client, no key | Fully keyless API. No proxy needed. |

### 7.2 Cloudflare Worker (API Proxy)

A single Cloudflare Worker handles all proxied requests. It runs at the edge (low latency), requires no server, and the free tier provides 100,000 requests per day — well beyond what this app needs.

```
Worker routes:
  /api/at/vehicles    → proxies to api.at.govt.nz (injects AT API key)
  /api/opensky/states → proxies to opensky-network.org (injects OAuth2 token)
```

The Worker also:
- Adds CORS headers so the client can fetch from it
- Caches OpenSky responses for 5 seconds (reduces credit consumption)
- Rate-limits by client IP (prevents abuse if the URL is shared widely)
- Returns a 429 with a friendly message if daily quota approaches the limit

### 7.3 Environment Variables

API keys are stored as Cloudflare Worker environment secrets (encrypted at rest, never logged):

```
# Set via: wrangler secret put AT_API_KEY
AT_API_KEY=<your Auckland Transport key>
OPENSKY_CLIENT_ID=<your OpenSky client ID>
OPENSKY_CLIENT_SECRET=<your OpenSky client secret>
```

The MapTiler key is set as a build-time environment variable in Cloudflare Pages, injected into the HTML at deploy time (not hardcoded in the repo):

```
# Cloudflare Pages → Settings → Environment Variables
MAPTILER_KEY=<your MapTiler key>
```

### 7.4 Local Development

For local development, a `config.local.js` file (gitignored) provides keys directly. The app detects `localhost` and uses direct API calls instead of the Worker proxy:

```javascript
// config.local.js (gitignored, never committed)
export const CONFIG = {
  MAPTILER_KEY: 'your-key',
  AT_API_KEY: 'your-key',
  OPENSKY_CLIENT_ID: 'your-id',       // optional
  OPENSKY_CLIENT_SECRET: 'your-secret' // optional
};
```

A `config.local.example.js` is committed to the repo with placeholder values.

### 7.5 Hosting Architecture

```
Cloudflare Pages (free tier)
├── Static assets (HTML, JS, CSS)
├── Custom domain: e.g. auckland.live
└── Linked Cloudflare Worker
    ├── /api/at/*      → Auckland Transport (key injected)
    ├── /api/opensky/* → OpenSky Network (OAuth2 injected)
    └── Rate limiting + CORS + response caching
```

Alternatives if not using Cloudflare: Vercel (Edge Functions), Netlify (Edge Functions), or Deno Deploy all offer equivalent free tiers with the same pattern. Cloudflare is recommended because the Worker and Pages integrate seamlessly and the free tier is the most generous.

## 8. Data Flow Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (Client)                     │
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐       │
│  │ MapLibre   │  │ deck.gl   │  │ UI Components  │       │
│  │ GL JS      │  │ Layers    │  │ (HUD, panels)  │       │
│  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘       │
│        │              │                 │                 │
│        │       ┌──────┴──────┐          │                 │
│        │       │ Data Store  │──────────┘                 │
│        │       │ (in-memory) │                            │
│        │       └──────┬──────┘                            │
│        │              │                                   │
│  ┌─────┴──────────────┴────────────────────────────────┐  │
│  │                 Fetch Scheduler                       │  │
│  │  AT GTFS-RT: every 10s  (via Worker proxy)           │  │
│  │  OpenSky:    every 10-15s (via Worker proxy)          │  │
│  │  Open-Meteo: every 300s  (direct, no key needed)     │  │
│  └──────┬─────────────┬──────────────┬─────────────────┘  │
│         │             │              │                    │
└─────────┼─────────────┼──────────────┼────────────────────┘
          │             │              │
          ▼             │              ▼
┌─────────────────┐     │      Open-Meteo API
│ Cloudflare Worker│     │      (direct, keyless)
│ (edge function)  │     │
│                  │◄────┘
│ • Injects keys   │
│ • CORS headers   │
│ • Response cache  │
│ • Rate limiting   │
└────┬────────┬────┘
     │        │
     ▼        ▼
 AT API    OpenSky API
```

The client never contacts AT or OpenSky directly in production. All authenticated requests route through the Cloudflare Worker, which injects credentials and returns the response. Open-Meteo is called directly since it requires no authentication.

For local development, the app detects `localhost` and calls APIs directly using keys from `config.local.js`.

## 9. Animation Strategy

Moving vehicles and aircraft are animated smoothly between known positions using linear interpolation (lerp). When a new position arrives from the API, the entity transitions from its current rendered position to the new position over the duration of the polling interval. This prevents the "jumping" effect of raw coordinate updates and creates the illusion of continuous movement.

```
t=0s: API returns position A
t=0-10s: entity smoothly animates from A toward B (predicted)
t=10s: API returns actual position B; correction applied
t=10-20s: entity smoothly animates from B toward C (predicted)
```

For aircraft, heading interpolation uses shortest-arc rotation to avoid spinning through 360°.

## 10. Offline / Error Handling

- If any API returns an error or times out, that layer shows a small warning badge on its toggle ("⚠ Stale — last update 45s ago"). The last known data remains visible.
- If MapTiler tiles fail to load (quota exhausted), fall back to OpenStreetMap raster tiles automatically.
- If the browser tab is backgrounded, polling pauses. On return to foreground, all layers refresh immediately.

## 11. Future Enhancements (Out of Scope for v1)

These are noted for reference but explicitly excluded from the initial build:

- **AIS shipping layer** (Hauraki Gulf vessel traffic) — pending a usable free data source
- **Waka Kotahi traffic flow** — NZTA API documentation needs investigation
- **3D building extrusions** — MapLibre supports this but increases tile load significantly
- **Time-lapse / replay mode** — record positions to IndexedDB, replay at 10x speed
- **Multiple city support** — parameterise the bounding box and API endpoints
- **Mobile native wrapper** — Capacitor or similar for iOS/Android

## 12. Getting Started

### 12.1 Local Development (5 minutes)

1. Clone the repository
2. Copy `config.local.example.js` → `config.local.js`
3. Obtain free API keys:
   - **MapTiler:** Sign up at maptiler.com/cloud → copy key (< 1 min)
   - **Auckland Transport:** Register at dev-portal.at.govt.nz → create app → copy API key (< 2 min)
   - **OpenSky (optional):** Register at opensky-network.org → set up OAuth2 client credentials (< 5 min). App works without this (anonymous access) but with lower rate limits.
4. Open `index.html` in a browser, or serve via `npx serve .`

No build step. No npm install. No framework boilerplate.

### 12.2 Public Deployment (15 minutes)

1. Create a Cloudflare account (free) at dash.cloudflare.com
2. Create a Cloudflare Pages project, linked to your Git repository
3. Set environment variables in Pages settings:
   - `MAPTILER_KEY` → your MapTiler key
4. Deploy the Cloudflare Worker (`worker/` directory):
   - `npx wrangler deploy`
   - `npx wrangler secret put AT_API_KEY` → paste your AT key
   - `npx wrangler secret put OPENSKY_CLIENT_ID` → paste your OpenSky client ID (optional)
   - `npx wrangler secret put OPENSKY_CLIENT_SECRET` → paste your OpenSky secret (optional)
5. In MapTiler dashboard, restrict your API key to your deployment domain
6. Optionally, connect a custom domain via Cloudflare DNS

The result is a publicly accessible URL where anyone can view the dashboard. No API keys are exposed in the client-side source. Total ongoing cost: zero.

---

## Appendix A: API Reference Summary

| API | Endpoint | Auth | Rate Limit (Free) | Refresh |
|---|---|---|---|---|
| Auckland Transport GTFS-RT | `api.at.govt.nz/realtime/legacy/vehiclelocations` | API key (free) | Unspecified; generous for personal use | 30s server-side |
| OpenSky Network | `opensky-network.org/api/states/all` | OAuth2 (optional) | Anonymous: 400/day; Auth: 4,000/day | 10s (auth) / 10s (anon) |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | None | Unlimited (non-commercial) | Model updates hourly |
| MapTiler Tiles | `api.maptiler.com/maps/{style}` | API key (free) | 100k requests/month, 5k sessions/month | Static tiles |

## Appendix B: Bounding Box Reference

| Area | South | West | North | East |
|---|---|---|---|---|
| Auckland metro (tight) | -37.00 | 174.65 | -36.75 | 175.00 |
| Upper North Island (flights) | -37.10 | 174.50 | -36.60 | 175.10 |
| Hauraki Gulf (future shipping) | -36.95 | 174.70 | -36.40 | 175.40 |
