// js/layers/transport.js
import { fetchAT } from '../utils/api-client.js';
import { classifyRoute } from '../utils/transport-quality.js';

// AT route classification — by routeId prefix
const ROUTE_COLOR = {
  unknown: [74, 158, 255, 230],
  train: [255, 140, 30, 220],
  ferry: [30, 200, 180, 220],
};

// AT route_id format is typically "{PREFIX}-{number}" e.g. "DEV-209"
// Extract a display-friendly label from it.
function routeLabel(routeId) {
  if (!routeId) return null;
  // Try to grab the numeric part: "DEV-209" → "209", "NX1" → "NX1"
  const m = routeId.match(/^[A-Z]+-(\d+)/);
  return m ? m[1] : routeId.split('-')[0];
}

export async function fetchTransportData() {
  const data = await fetchAT('/vehiclelocations');

  const entities = data?.response?.entity ?? data?.entity ?? [];
  if (entities.length === 0) {
    console.warn('[transport] No entities in response. Raw:', data);
  }

  const vehicles = [];
  for (const entity of entities) {
    const v = entity.vehicle;
    const lat = Number(v?.position?.latitude);
    const lon = Number(v?.position?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)
      || lat < -37.3 || lat > -36.3 || lon < 174.2 || lon > 175.6) continue;

    const rawRouteId = v.trip?.route_id ?? v.trip?.routeId ?? '';
    const label      = v.vehicle?.label ?? '';

    vehicles.push({
      id:        entity.id,
      position:  [lon, lat],
      bearing:   v.position.bearing ?? 0,
      reportedSpeed: v.position.speed ?? null, // Kept for diagnostics; never shown as verified speed.
      routeId:   rawRouteId,
      routeLabel: routeLabel(rawRouteId),     // display label e.g. "209"
      vehicleLabel: label,                    // e.g. "Korora" for ferries
      vehicleId: v.vehicle?.id ?? entity.id,
      startTime: v.trip?.start_time ?? null,
      directionId: v.trip?.direction_id ?? null,
      timestamp: v.timestamp,
    });
  }
  return vehicles;
}

const TRAIL_FADE_MS = 120_000; // 2 min — segments older than this are invisible

export function buildTransportTrailLayer(trails, visible) {
  const now = Date.now();
  const segments = [];
  for (const history of trails.values()) {
    if (history.length < 2) continue;
    const routeId = history[history.length - 1].routeId ?? '';
    const [r, g, b] = ROUTE_COLOR[classifyRoute(routeId)];
    for (let i = 0; i < history.length - 1; i++) {
      const ageMs = now - (history[i].ts ?? now);
      if (ageMs >= TRAIL_FADE_MS) continue;            // fully expired, skip
      const t = 1 - ageMs / TRAIL_FADE_MS;             // 1 = fresh, 0 = 2 min old
      const alpha = Math.round(t * 200);
      segments.push({ path: [history[i].position, history[i + 1].position], color: [r, g, b, alpha] });
    }
  }
  return new deck.PathLayer({
    id: 'transport-trail-layer',
    data: segments,
    visible,
    pickable: false,
    widthMinPixels: 1,
    widthMaxPixels: 2,
    getPath: d => d.path,
    getColor: d => d.color,
    getWidth: 1,
  });
}

const VEHICLE_ICON = {
  url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="white" d="M16 3 26 25 16 21 6 25Z"/></svg>')}`,
  width: 32, height: 32, anchorX: 16, anchorY: 16, mask: true,
};

export function buildTransportLayer(vehicles, visible) {
  return new deck.IconLayer({
    id: 'transport-layer',
    data: vehicles,
    visible,
    pickable: true,
    getIcon: () => VEHICLE_ICON,
    billboard: false,
    getPosition: d => d.position,
    getColor: d => {
      const color = ROUTE_COLOR[classifyRoute(d.routeId)];
      return [...color.slice(0, 3), d.positionQuality === 'rejected' || !d.timestamp || Date.now() - d.timestamp > 120_000 ? 80 : color[3]];
    },
    getAngle: d => -d.bearing,
    getSize: 16,
    sizeUnits: 'pixels',
  });
}
