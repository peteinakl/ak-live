// js/utils/api-client.js
// Routes API calls through local proxy on localhost, or CF Worker in production.

const IS_LOCAL =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const PROXY_BASE = 'http://localhost:3001';

export async function fetchAT(path) {
  const url = IS_LOCAL
    ? `${PROXY_BASE}/at${path}`
    : `/api/at${path}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AT API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function fetchOpenSky(path) {
  const url = IS_LOCAL
    ? `${PROXY_BASE}/opensky${path}`
    : `/api/opensky${path}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenSky API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function fetchWeather(url) {
  // Open-Meteo is keyless — direct call always
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  return res.json();
}
