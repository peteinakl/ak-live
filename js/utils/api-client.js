// js/utils/api-client.js
// Routes API calls through local proxy on localhost, or CF Worker in production.

const IS_LOCAL =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const PROXY_BASE = 'http://localhost:3001';

// The shared demo's Worker refreshes AT every 20s and OpenSky every 30s, so
// polling faster in production would only spend Worker request quota.
export const POLL_MS = {
  transport: IS_LOCAL ? 10_000 : 20_000,
  aircraft: IS_LOCAL ? 10_000 : 30_000,
};

export async function fetchAT(path) {
  const url = IS_LOCAL
    ? `${PROXY_BASE}/at${path}`
    : `/api/at${path}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`AT API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function fetchOpenSky(path) {
  const url = IS_LOCAL
    ? `${PROXY_BASE}/opensky${path}`
    : `/api/opensky${path}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenSky API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function fetchWeather(url) {
  // Open-Meteo is keyless — direct call always
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  return res.json();
}
