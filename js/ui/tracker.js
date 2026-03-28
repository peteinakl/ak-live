// js/ui/tracker.js — Vehicle/aircraft follow mode
// Centres the map on the tracked entity each poll and shows a compact HUD.

let _map         = null;
let _trackedId   = null;   // vehicle.id or aircraft.icao24
let _trackedType = null;   // 'transport' | 'aircraft'

const hud      = document.getElementById('tracker-hud');
const nameEl   = document.getElementById('tracker-name');
const metaEl   = document.getElementById('tracker-meta');
const badgeEl  = document.getElementById('tracker-badge');
const closeBtn = document.getElementById('tracker-close');

closeBtn.addEventListener('click', stopTracking);

export function initTracker(map) {
  _map = map;
}

export function isTracking() {
  return _trackedId !== null;
}

export function startTracking(entity, type) {
  _trackedId   = type === 'transport' ? entity.id : entity.icao24;
  _trackedType = type;

  _map.flyTo({
    center:   entity.position.slice(0, 2),
    zoom:     Math.max(_map.getZoom(), 13),
    duration: 1400,
  });

  _renderHUD(entity, type);
  hud.classList.add('visible');
}

export function stopTracking() {
  _trackedId   = null;
  _trackedType = null;
  hud.classList.remove('visible');
}

// Called after each data poll — re-centres map and refreshes HUD values.
export function updateTracker(vehicles, aircraft) {
  if (!_trackedId) return;

  const entity = _trackedType === 'transport'
    ? vehicles.find(v => v.id === _trackedId)
    : aircraft.find(a => a.icao24 === _trackedId);

  if (!entity) {
    stopTracking();   // entity dropped off the feed
    return;
  }

  _map.easeTo({ center: entity.position.slice(0, 2), duration: 1800 });
  _renderHUD(entity, _trackedType);
}

// ── Internal ────────────────────────────────────────────────────

const TRAIN_ROUTES = ['EAST', 'WEST', 'SOUTH', 'ONE', 'PUK'];

function _vehicleType(routeId) {
  if (!routeId) return 'bus';
  const r = routeId.toUpperCase();
  if (r.includes('FERRY')) return 'ferry';
  if (TRAIN_ROUTES.some(t => r.includes(t))) return 'train';
  return 'bus';
}

function _renderHUD(entity, type) {
  if (type === 'transport') {
    const speedKmh = entity.speed != null
      ? `${Math.round(entity.speed * 3.6)} km/h` : 'n/a';
    const bearing  = entity.bearing != null
      ? `${Math.round(Number(entity.bearing))}°` : '—';
    const vtype    = _vehicleType(entity.routeId);

    nameEl.textContent = entity.vehicleLabel ||
      (entity.routeLabel ? `Route ${entity.routeLabel}` : `Vehicle ${entity.vehicleId}`);
    metaEl.textContent = `${speedKmh} · ${bearing}`;

    badgeEl.textContent = vtype.toUpperCase();
    badgeEl.dataset.vtype = vtype;
  } else {
    const speedKts = entity.velocity != null
      ? `${Math.round(entity.velocity * 1.944)} kts` : 'n/a';
    const altM     = entity.onGround ? 'on ground'
      : `${Math.round(entity.altitude)} m`;
    const heading  = entity.heading != null
      ? `${Math.round(entity.heading)}°` : '—';

    nameEl.textContent = entity.callsign || entity.icao24;
    metaEl.textContent = entity.onGround
      ? `On ground · ${heading}`
      : `${altM} · ${speedKts} · ${heading}`;

    badgeEl.textContent = 'ACFT';
    badgeEl.dataset.vtype = 'aircraft';
  }
}
