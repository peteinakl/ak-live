// worker/limits.js — Pure helpers shared by the Worker and Node tests.

// Traffic tiles are only proxied over greater Auckland, where all live data is.
export const TRAFFIC_BOUNDS = { west: 174.2, south: -37.5, east: 175.6, north: -36.2 };
export const TRAFFIC_MIN_ZOOM = 10;
export const TRAFFIC_MAX_ZOOM = 15;

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export function isAllowedTrafficTile(z, x, y, bounds = TRAFFIC_BOUNDS) {
  if (![z, x, y].every(Number.isInteger)) return false;
  if (z < TRAFFIC_MIN_ZOOM || z > TRAFFIC_MAX_ZOOM) return false;
  return x >= lonToTileX(bounds.west, z) && x <= lonToTileX(bounds.east, z)
    && y >= latToTileY(bounds.north, z) && y <= latToTileY(bounds.south, z);
}

// Budgets reset at UTC midnight.
export function budgetDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isFresh(fetchedAt, ttlSeconds, now = Date.now()) {
  return fetchedAt > 0 && now - fetchedAt < ttlSeconds * 1000;
}
