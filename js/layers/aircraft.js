// js/layers/aircraft.js
import { fetchOpenSky } from '../utils/api-client.js';

// White top-down plane silhouette pointing up (north).
const PLANE_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
  '<path d="M12 1C13 1 14 6 14 11L23 17L23 19L14 16L13 22L16 23L16 25L12 24L8 25L8 23L11 22L10 16L1 19L1 17L10 11C10 6 11 1 12 1Z" fill="white"/>' +
  '</svg>'
)}`;
const PLANE_ICON = { url: PLANE_SVG, width: 24, height: 24, anchorX: 12, anchorY: 12 };

// Bounding box: upper North Island / Hauraki Gulf (catches NZAA approach traffic)
const BBOX = 'lamin=-37.1&lomin=174.5&lamax=-36.6&lomax=175.1';

// OpenSky states array indices
// [icao24, callsign, origin_country, time_position, last_contact,
//  longitude(5), latitude(6), baro_altitude(7), on_ground(8),
//  velocity(9), true_track(10), vertical_rate(11), ...]

export async function fetchAircraftData() {
  const data = await fetchOpenSky(`/states/all?${BBOX}`);
  const aircraft = [];

  for (const s of (data.states ?? [])) {
    if (s[5] == null || s[6] == null) continue;

    aircraft.push({
      icao24:   s[0],
      callsign: (s[1] ?? '').trim(),
      position: [s[5], s[6]],
      altitude: s[7] ?? 0,
      onGround: s[8],
      velocity: s[9],
      heading:  s[10] ?? 0,
      vertRate: s[11],
    });
  }
  return aircraft;
}

function getColor(a) {
  if (a.onGround)        return [80, 220, 80, 220];   // green — ground
  if (a.altitude > 8000) return [255, 160, 40, 230];  // orange — cruising
  if (a.altitude > 3000) return [255, 140, 20, 240];  // deeper orange — mid
  return [255, 120, 0, 255];                           // bright orange — approach
}


export function buildAircraftTrailLayer(trails, visible) {
  const segments = [];
  for (const history of trails.values()) {
    if (history.length < 2) continue;
    const last = history[history.length - 1];
    const [r, g, b] = getColor(last).slice(0, 3);
    const n = history.length - 1;
    for (let i = 0; i < n; i++) {
      const alpha = Math.round(20 + (i / n) * 170); // 20 (oldest) → 190 (newest)
      segments.push({ path: [history[i].position, history[i + 1].position], color: [r, g, b, alpha] });
    }
  }
  return new deck.PathLayer({
    id: 'aircraft-trail-layer',
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

export function buildAircraftLayer(aircraft, visible) {
  return new deck.ScatterplotLayer({
    id: 'aircraft-layer',
    data: aircraft,
    visible,
    pickable: true,
    opacity: 0.9,
    stroked: true,
    filled: true,
    radiusMinPixels: 3,
    radiusMaxPixels: 14,
    getPosition: d => d.position,
    getFillColor: d => getColor(d),
    getLineColor: [255, 255, 255, 40],
    lineWidthMinPixels: 1,
    getRadius: 60,
  });
}
