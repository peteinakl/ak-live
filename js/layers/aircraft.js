// js/layers/aircraft.js
import { fetchOpenSky } from '../utils/api-client.js';

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
  if (a.onGround)       return [80, 220, 80, 220];    // green — ground
  if (a.altitude > 8000) return [240, 240, 255, 220]; // white — cruising
  if (a.altitude > 3000) return [255, 200, 80, 220];  // amber — mid
  return [255, 120, 40, 230];                          // orange-red — approach
}

function getRadius(a) {
  if (a.onGround)        return 80;
  if (a.altitude > 8000) return 50;
  if (a.altitude > 3000) return 80;
  return 120;
}

export function buildAircraftTrailLayer(trails, visible) {
  const paths = [];
  for (const history of trails.values()) {
    if (history.length < 2) continue;
    const last = history[history.length - 1];
    const [r, g, b] = getColor(last).slice(0, 3);
    paths.push({ path: history.map(h => h.position), color: [r, g, b, 160] });
  }
  return new deck.PathLayer({
    id: 'aircraft-trail-layer',
    data: paths,
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
    opacity: 0.95,
    stroked: true,
    filled: true,
    radiusMinPixels: 3,
    radiusMaxPixels: 14,
    getPosition: d => d.position,
    getFillColor: d => getColor(d),
    getLineColor: [255, 255, 255, 40],
    lineWidthMinPixels: 1,
    getRadius: d => getRadius(d),
  });
}
