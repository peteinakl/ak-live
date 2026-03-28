// js/ui/tracker.js — Vehicle/aircraft follow mode
// Centres the map on the tracked entity each poll and shows a glass HUD
// with the full detail set (same data as the bottom popup).

let _map         = null;
let _trackedId   = null;   // vehicle.id or aircraft.icao24
let _trackedType = null;   // 'transport' | 'aircraft'
let _marker      = null;   // maplibregl.Marker for the on-map callout

const hud      = document.getElementById('tracker-hud');
const nameEl   = document.getElementById('tracker-name');
const metaEl   = document.getElementById('tracker-meta');
const badgeEl  = document.getElementById('tracker-badge');
const detailEl = document.getElementById('tracker-detail');
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
    zoom:     Math.max(_map.getZoom(), 15),
    duration: 1600,
  });

  _renderHUD(entity, type);
  hud.classList.add('visible');
  _placeMarker(entity);
}

export function stopTracking() {
  _trackedId   = null;
  _trackedType = null;
  hud.classList.remove('visible');
  if (_marker) { _marker.remove(); _marker = null; }
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

  const pos = entity.position.slice(0, 2);
  _map.easeTo({ center: pos, duration: 1800 });
  _renderHUD(entity, _trackedType);
  if (_marker) { _marker.setLngLat(pos); _updateCalloutLabel(entity, _trackedType); }
}

// ── Marker ───────────────────────────────────────────────────────

function _placeMarker(entity) {
  if (_marker) { _marker.remove(); _marker = null; }

  const el = document.createElement('div');
  el.className = 'track-marker';
  el.innerHTML = `
    <div class="track-ring track-ring--1"></div>
    <div class="track-ring track-ring--2"></div>
    <div class="track-lock-ring"></div>
    <div class="track-callout">
      <div class="track-callout-tag" id="track-callout-label"></div>
      <div class="track-callout-stem"></div>
    </div>`;

  _marker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(entity.position.slice(0, 2))
    .addTo(_map);

  _updateCalloutLabel(entity, _trackedType);
}

function _updateCalloutLabel(entity, type) {
  const el = document.getElementById('track-callout-label');
  if (!el) return;
  if (type === 'transport') {
    el.textContent = entity.vehicleLabel ||
      (entity.routeLabel ? `Route ${entity.routeLabel}` : `Vehicle ${entity.vehicleId}`);
  } else {
    el.textContent = entity.callsign || entity.icao24;
  }
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

function _row(label, value) {
  return `<span class="tracker-detail-label">${label}</span>`
       + `<span class="tracker-detail-value">${value}</span>`;
}

function _renderHUD(entity, type) {
  if (type === 'transport') {
    const speedKmh = entity.speed != null
      ? `${Math.round(entity.speed * 3.6)} km/h` : 'n/a';
    const bearing  = entity.bearing != null
      ? `${Math.round(Number(entity.bearing))}°` : '—';
    const vtype    = _vehicleType(entity.routeId);
    const title    = entity.vehicleLabel ||
      (entity.routeLabel ? `Route ${entity.routeLabel}` : `Vehicle ${entity.vehicleId}`);

    nameEl.textContent    = title;
    metaEl.textContent    = `${speedKmh} · ${bearing}`;
    badgeEl.textContent   = vtype.toUpperCase();
    badgeEl.dataset.vtype = vtype;

    const rows = [];
    if (entity.routeLabel)   rows.push(_row('Route',      entity.routeLabel));
    if (entity.routeId)      rows.push(_row('Route ID',   entity.routeId));
    if (entity.startTime)    rows.push(_row('Trip start', entity.startTime));
    if (entity.directionId != null)
      rows.push(_row('Direction', entity.directionId === 0 ? '→ Outbound' : '← Inbound'));
    rows.push(_row('Vehicle ID', entity.vehicleId));
    rows.push(_row('Speed',      speedKmh));
    rows.push(_row('Bearing',    bearing));
    detailEl.innerHTML = rows.join('');

  } else {
    const altM     = Math.round(entity.altitude);
    const altFt    = Math.round(entity.altitude * 3.281);
    const speedKts = entity.velocity != null
      ? `${Math.round(entity.velocity * 1.944)} kts` : 'n/a';
    const status   = entity.onGround ? 'On ground' : `${altM} m / ${altFt} ft`;
    const heading  = entity.heading != null ? `${Math.round(entity.heading)}°` : '—';
    const vertRate = entity.vertRate != null
      ? (entity.vertRate > 0.5 ? '↑ climbing'
        : entity.vertRate < -0.5 ? '↓ descending' : '→ level')
      : 'n/a';

    nameEl.textContent    = entity.callsign || entity.icao24;
    metaEl.textContent    = entity.onGround
      ? `On ground · ${heading}`
      : `${altM} m · ${speedKts} · ${heading}`;
    badgeEl.textContent   = 'ACFT';
    badgeEl.dataset.vtype = 'aircraft';

    detailEl.innerHTML = [
      _row('ICAO24',   entity.icao24),
      _row('Altitude', status),
      _row('Speed',    speedKts),
      _row('Heading',  heading),
      _row('Vertical', vertRate),
    ].join('');
  }
}
