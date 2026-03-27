// js/layers/transport.js
import { fetchAT } from '../utils/api-client.js';

// AT route classification — by routeId prefix
const TRAIN_ROUTES = ['EAST', 'WEST', 'SOUTH', 'ONE', 'PUK'];

function classifyRoute(routeId) {
  if (!routeId) return 'bus';
  const r = routeId.toUpperCase();
  if (r.includes('FERRY')) return 'ferry';
  if (TRAIN_ROUTES.some(t => r.includes(t))) return 'train';
  return 'bus';
}

const ROUTE_COLOR = {
  bus:   [30, 120, 255, 210],
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
    if (!v?.position?.latitude || !v?.position?.longitude) continue;

    const rawRouteId = v.trip?.route_id ?? v.trip?.routeId ?? '';
    const label      = v.vehicle?.label ?? '';

    vehicles.push({
      id:        entity.id,
      position:  [v.position.longitude, v.position.latitude],
      bearing:   v.position.bearing ?? 0,
      speed:     v.position.speed ?? null,    // m/s
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

export function buildTransportTrailLayer(trails, visible) {
  const paths = [];
  for (const history of trails.values()) {
    if (history.length < 2) continue;
    const routeId = history[history.length - 1].routeId ?? '';
    const [r, g, b] = ROUTE_COLOR[classifyRoute(routeId)];
    paths.push({ path: history.map(h => h.position), color: [r, g, b, 180] });
  }
  return new deck.PathLayer({
    id: 'transport-trail-layer',
    data: paths,
    visible,
    pickable: false,
    widthMinPixels: 1,
    widthMaxPixels: 3,
    getPath: d => d.path,
    getColor: d => d.color,
    getWidth: 2,
  });
}

export function buildTransportLayer(vehicles, visible) {
  return new deck.ScatterplotLayer({
    id: 'transport-layer',
    data: vehicles,
    visible,
    pickable: true,
    opacity: 0.9,
    stroked: true,
    filled: true,
    radiusMinPixels: 4,
    radiusMaxPixels: 10,
    getPosition: d => d.position,
    getFillColor: d => ROUTE_COLOR[classifyRoute(d.routeId)],
    getLineColor: [255, 255, 255, 50],
    lineWidthMinPixels: 1,
    getRadius: 60,
  });
}
