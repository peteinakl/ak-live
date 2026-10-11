import { classifyRoute } from '../utils/transport-quality.js';
import { escapeHTML, ageLabel } from '../utils/format.js';

let map = null;
let trackedId = null;
let trackedType = null;
let marker = null;
let onStart = () => {};
let cameraReadyAt = 0;
let lastPosition = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const hud = document.getElementById('tracker-hud');
const nameEl = document.getElementById('tracker-name');
const metaEl = document.getElementById('tracker-meta');
const badgeEl = document.getElementById('tracker-badge');
const detailEl = document.getElementById('tracker-detail');
const infoBtn = document.getElementById('tracker-info-btn');
const notePanel = document.getElementById('tracker-data-note');

document.getElementById('tracker-close').addEventListener('click', stopTracking);
infoBtn.addEventListener('click', () => {
  const open = notePanel.classList.toggle('open');
  notePanel.setAttribute('aria-hidden', String(!open));
  infoBtn.classList.toggle('active', open);
  infoBtn.setAttribute('aria-expanded', String(open));
});

export function initTracker(value, options = {}) {
  map = value;
  onStart = options.onStart ?? (() => {});
  for (const event of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
    map.on(event, e => { if (e.originalEvent) stopTracking(); });
  }
}
export function isTracking() { return trackedId !== null; }

export function startTracking(entity, type) {
  onStart();
  trackedId = type === 'transport' ? entity.id : entity.icao24;
  trackedType = type;
  lastPosition = null;
  cameraReadyAt = performance.now() + (reducedMotion.matches ? 0 : 1600);
  map.flyTo({ center: entity.position.slice(0, 2), zoom: Math.max(map.getZoom(), 14.5), duration: reducedMotion.matches ? 0 : 1600 });
  renderHUD(entity, type);
  hud.classList.add('visible');
  hud.inert = false;
  hud.setAttribute('aria-hidden', 'false');
  document.body.classList.add('tracking');
  placeMarker(entity);
}

export function stopTracking() {
  const wasTracking = trackedId !== null;
  trackedId = null;
  trackedType = null;
  hud.classList.remove('visible');
  hud.inert = true;
  hud.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('tracking');
  notePanel.classList.remove('open');
  notePanel.setAttribute('aria-hidden', 'true');
  infoBtn.classList.remove('active');
  infoBtn.setAttribute('aria-expanded', 'false');
  if (marker) { marker.remove(); marker = null; }
  if (wasTracking) map?.stop();
}

function findEntity(vehicles, aircraft) {
  return trackedType === 'transport' ? vehicles.find(v => v.id === trackedId) : aircraft.find(a => a.icao24 === trackedId);
}

export function updateTracker(vehicles, aircraft) {
  if (trackedId === null) return;
  const entity = findEntity(vehicles, aircraft);
  if (!entity) { stopTracking(); return; }
  renderHUD(entity, trackedType);
}

// Camera, icon and callout use the same interpolated point, avoiding a marker
// that jumps ahead to the raw observation while its vehicle is still moving.
export function syncTrackerPosition(vehicles, aircraft) {
  if (trackedId === null) return;
  const entity = findEntity(vehicles, aircraft);
  if (!entity) return;
  const pos = entity.position.slice(0, 2);
  marker?.setLngLat(pos);
  if (performance.now() < cameraReadyAt) return;
  if (lastPosition && pos.every((value, i) => value === lastPosition[i])) return;
  map.jumpTo({ center: pos });
  lastPosition = pos;
}

function title(entity, type) {
  return type === 'transport' ? entity.vehicleLabel || (entity.routeLabel ? `Route ${entity.routeLabel}` : 'Transit vehicle') : entity.callsign || entity.icao24;
}
function placeMarker(entity) {
  marker?.remove();
  const el = document.createElement('div');
  el.className = 'track-marker';
  el.innerHTML = '<div class="track-ring track-ring--1"></div><div class="track-ring track-ring--2"></div><div class="track-lock-ring"></div><div class="track-callout"><div class="track-callout-tag"></div><div class="track-callout-stem"></div></div>';
  el.querySelector('.track-callout-tag').textContent = title(entity, trackedType);
  marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(entity.position.slice(0, 2)).addTo(map);
}
function row(label, value) {
  return `<span class="tracker-detail-label">${escapeHTML(label)}</span><span class="tracker-detail-value">${escapeHTML(value)}</span>`;
}
function technical(rows) {
  return `<details class="tracker-technical"><summary>Technical details ⌄</summary><div class="tracker-detail">${rows.join('')}</div></details>`;
}
function renderHUD(entity, type) {
  // Preserve the user's disclosure state across automatic refreshes.
  const technicalOpen = detailEl.querySelector('details')?.open;
  nameEl.textContent = title(entity, type);
  if (type === 'transport') {
    const fresh = entity.timestamp && Date.now() - entity.timestamp <= 120_000;
    const speed = fresh && entity.speed !== null ? `~${Math.round(entity.speed * 3.6)} km/h` : 'Unavailable';
    const mode = classifyRoute(entity.routeId);
    badgeEl.textContent = mode === 'unknown' ? 'TRANSIT' : `${mode.toUpperCase()}*`;
    badgeEl.dataset.vtype = mode;
    metaEl.textContent = fresh && entity.speed !== null ? `${entity.speed <= 1.4 ? 'Stopped / moving slowly' : 'In motion'} · GPS estimate` : fresh ? 'Building a reliable speed estimate' : 'Last known position · stale';
    infoBtn.hidden = false;
    detailEl.innerHTML = `<div class="tracker-detail">${[
      row('Est. speed', speed), row('Observation', ageLabel(entity.timestamp)),
      row('Quality', fresh ? entity.speedNote : 'Stale observation; speed unavailable'),
      entity.routeLabel ? row('Route', entity.routeLabel) : '',
    ].join('')}</div>` + technical([
      row('Vehicle ID', entity.vehicleId), row('Route ID', entity.routeId || 'Unknown'),
      row('Trip start', entity.startTime || 'Unknown'),
      row('Direction ID', entity.directionId ?? 'Unknown'),
      row('Bearing', `${Math.round(entity.bearing)}°`),
    ]);
  } else {
    const altitude = entity.altitude === null ? 'Unavailable' : `${Math.round(entity.altitude).toLocaleString()} m / ${Math.round(entity.altitude * 3.281).toLocaleString()} ft`;
    const speed = entity.velocity === null ? 'Unavailable' : `${Math.round(entity.velocity * 1.944)} kts`;
    const vertical = entity.onGround ? 'On ground' : entity.vertRate === null ? 'Vertical rate unavailable' : entity.vertRate > .5 ? 'Climbing' : entity.vertRate < -.5 ? 'Descending' : 'Level flight';
    metaEl.textContent = `${vertical} · ${speed}`;
    badgeEl.textContent = 'AIRCRAFT';
    badgeEl.dataset.vtype = 'aircraft';
    infoBtn.hidden = true;
    notePanel.classList.remove('open');
    notePanel.setAttribute('aria-hidden', 'true');
    infoBtn.classList.remove('active');
    infoBtn.setAttribute('aria-expanded', 'false');
    detailEl.innerHTML = `<div class="tracker-detail">${[
      row('Altitude', entity.onGround ? 'On ground' : altitude), row('Ground speed', speed),
      row('Flight state', vertical), row('Observation', ageLabel(entity.timestamp)),
    ].join('')}</div>` + technical([row('ICAO24', entity.icao24), row('Heading', `${Math.round(entity.heading)}°`)]);
  }
  if (technicalOpen) detailEl.querySelector('details').open = true;
}
