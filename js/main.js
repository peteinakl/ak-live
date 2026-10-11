import { loadConfig } from './utils/config.js';
import { initMap, setLayers, buildStreetsStyle, buildAerialStyle, removeHillshadeLayers, addTrafficLayer, trafficTileUrl, applyNightStyle } from './map-init.js';
import { fetchTransportData, buildTransportLayer, buildTransportTrailLayer } from './layers/transport.js';
import { fetchAircraftData, buildAircraftLayer, buildAircraftTrailLayer } from './layers/aircraft.js';
import { fetchWeatherData, updateWeatherHUD, updateForecastStrip, fetchRadarInfo, buildRadarLayer } from './layers/weather.js';
import { initControls, updateCounts, initBasemapToggle } from './ui/controls.js';
import { setWeatherHudVisible } from './ui/hud.js';
import { initTracker, startTracking, stopTracking, updateTracker, syncTrackerPosition } from './ui/tracker.js';
import { initScenes, SCENES, DEFAULT_SCENE } from './ui/scenes.js';
import { updateBriefing, updateFreshness } from './ui/briefing.js';
import { initIdle } from './ui/idle.js';
import { POLL_MS } from './utils/api-client.js';
import { TransportQuality } from './utils/transport-quality.js';
import { MotionStore } from './utils/motion.js';

const state = {
  vehicles: [], aircraft: [], weather: null, radarInfo: null,
  vehicleTrails: new Map(), aircraftTrails: new Map(),
  visible: { transport: true, aircraft: true, weather: true, traffic: false },
  feeds: { transport: {}, aircraft: {}, weather: {}, radar: {} },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const vehicleMotion = new MotionStore(POLL_MS.transport);
const aircraftMotion = new MotionStore(POLL_MS.aircraft);
const quality = new TransportQuality();
const pending = new Set();
let map, overlay, scenes, idle;
let frameId = null;
let staticLayers = [];
// Aerial (LINZ) is the default: it loads reliably and spares the MapTiler quota.
let currentBasemap = 'aerial';

function updateTrails(entities, history, key) {
  const seen = new Set();
  for (const entity of entities) {
    seen.add(entity[key]);
    if (!entity.timestamp || Date.now() - entity.timestamp > 120_000 || entity.positionQuality === 'rejected') continue;
    const points = history.get(entity[key]) ?? [];
    if (points.at(-1)?.ts >= entity.timestamp) continue;
    points.push({ ...entity, ts: entity.timestamp });
    // Disconnected observations should not paint a line across a feed gap.
    if (points.length > 1 && entity.timestamp - points.at(-2).ts > 120_000) points.splice(0, points.length - 1);
    while (points.length > 15 || (points.length && entity.timestamp - points[0].ts > 120_000)) points.shift();
    history.set(entity[key], points);
  }
  for (const id of history.keys()) if (!seen.has(id)) history.delete(id);
}

function renderMotion(now = performance.now()) {
  if (!overlay) return;
  const vehicles = vehicleMotion.get(now);
  const aircraft = aircraftMotion.get(now);
  setLayers(overlay, [...staticLayers,
    buildTransportLayer(vehicles, state.visible.transport),
    buildAircraftLayer(aircraft, state.visible.aircraft),
  ].filter(Boolean));
  syncTrackerPosition(vehicles, aircraft);
}

function animate(now) {
  frameId = null;
  if (document.hidden) return;
  renderMotion(now);
  if (vehicleMotion.isAnimating(now) || aircraftMotion.isAnimating(now)) frameId = requestAnimationFrame(animate);
}

function requestAnimation() {
  if (document.hidden || frameId !== null) return;
  frameId = requestAnimationFrame(animate);
}

function rebuildLayers() {
  staticLayers = [
    buildRadarLayer(state.radarInfo, state.visible.weather),
    buildTransportTrailLayer(state.vehicleTrails, state.visible.transport),
    buildAircraftTrailLayer(state.aircraftTrails, state.visible.aircraft),
  ].filter(Boolean);
  renderMotion();
  updateCounts({ transport: state.vehicles.length, aircraft: state.aircraft.length });
  requestAnimation();
}

function updateUI() {
  updateFreshness(state.feeds, state.radarInfo);
  if (map) updateBriefing(state, map);
  updateTracker(state.vehicles, state.aircraft);
}

// One in-flight request per feed; a hidden or idle tab does not spend API credits.
async function refresh(name, fetcher, apply) {
  if (document.hidden || idle?.isPaused() || pending.has(name)) return;
  pending.add(name);
  try {
    const data = await fetcher();
    if (!data) throw new Error('No feed data');
    apply(data);
    state.feeds[name] = { updatedAt: Date.now(), error: false };
  } catch {
    state.feeds[name].error = true;
  } finally {
    pending.delete(name);
    updateUI();
  }
}
const refreshTransport = () => refresh('transport', fetchTransportData, data => {
  state.vehicles = quality.process(data);
  updateTrails(state.vehicles, state.vehicleTrails, 'id');
  vehicleMotion.update(state.vehicles, 'id', performance.now(), reducedMotion.matches);
  rebuildLayers();
});
let flightsEnabled = true;
const refreshAircraft = () => flightsEnabled && refresh('aircraft', fetchAircraftData, data => {
  state.aircraft = data;
  updateTrails(data, state.aircraftTrails, 'icao24');
  aircraftMotion.update(data, 'icao24', performance.now(), reducedMotion.matches);
  rebuildLayers();
});
const refreshWeather = () => refresh('weather', fetchWeatherData, data => {
  state.weather = data;
  updateWeatherHUD(data);
  updateForecastStrip(data);
});
const refreshRadar = () => refresh('radar', fetchRadarInfo, data => {
  state.radarInfo = data;
  rebuildLayers();
});
function refreshAll() { refreshTransport(); refreshAircraft(); refreshWeather(); refreshRadar(); }

function setVisible(name, value) {
  state.visible[name] = value;
  const checkbox = document.getElementById(`toggle-${name}`);
  if (checkbox) checkbox.checked = value;
  if (name === 'weather') setWeatherHudVisible(value);
  if (name === 'traffic') {
    if (map.getLayer('tomtom-traffic-flow')) map.setLayoutProperty('tomtom-traffic-flow', 'visibility', value ? 'visible' : 'none');
  } else rebuildLayers();
}

async function init() {
  const config = await loadConfig();
  // The shared demo has no flights feed (see worker/index.js); hide its UI.
  if (config.FLIGHTS === false) {
    flightsEnabled = false;
    state.visible.aircraft = false;
    document.querySelectorAll('[data-feature="flights"]').forEach(el => { el.hidden = true; });
  }
  const { title: _title, ...initialView } = SCENES[DEFAULT_SCENE];
  const result = initMap(buildAerialStyle(config.LINZ_API_KEY), initialView, ({ object, layer }) => {
    if (!object) { stopTracking(); return; }
    if (layer.id === 'transport-layer') startTracking(object, 'transport');
    if (layer.id === 'aircraft-layer') startTracking(object, 'aircraft');
    requestAnimation();
  });
  map = result.map;
  overlay = result.overlay;
  initTracker(map, { onStart: () => scenes?.stopTour() });
  scenes = initScenes(map, {
    reducedMotion, stopTracking,
    onSelect: id => {
      setVisible('transport', id !== 'airport' || !flightsEnabled);
      if (flightsEnabled) setVisible('aircraft', id !== 'city');
      setVisible('traffic', id === 'city' || id === 'region');
    },
  });
  initControls({
    onTransportToggle: v => setVisible('transport', v), onAircraftToggle: v => setVisible('aircraft', v),
    onWeatherToggle: v => setVisible('weather', v), onTrafficToggle: v => setVisible('traffic', v),
  });
  initBasemapToggle(basemap => {
    if (basemap === currentBasemap) return;
    currentBasemap = basemap;
    map.setStyle(basemap === 'aerial' ? buildAerialStyle(config.LINZ_API_KEY) : buildStreetsStyle(config.MAPTILER_KEY), { diff: false });
  });
  const compact = matchMedia('(max-width: 600px)');
  const medium = matchMedia('(max-width: 900px)');
  function adaptPanels() {
    document.getElementById('controls').open = !compact.matches;
    document.getElementById('city-briefing').open = !medium.matches;
  }
  adaptPanels();
  compact.addEventListener('change', adaptPanels);
  medium.addEventListener('change', adaptPanels);

  document.getElementById('insight-transport').addEventListener('click', () => scenes.select('region'));
  document.getElementById('insight-aircraft').addEventListener('click', () => scenes.select('airport'));
  document.getElementById('insight-weather').addEventListener('click', () => {
    setVisible('weather', true);
    document.getElementById('forecast-strip').scrollTo({ left: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    document.getElementById('weather-hud').animate([{ outline: '2px solid #72e3df' }, { outline: '2px solid transparent' }], { duration: reducedMotion.matches ? 0 : 1400 });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { stopTracking(); scenes.stopTour(); map.stop(); }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { vehicleMotion.finish(); aircraftMotion.finish(); }
    rebuildLayers();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { vehicleMotion.finish(); aircraftMotion.finish(); refreshAll(); rebuildLayers(); }
  });
  idle = initIdle({
    onPause: () => { scenes.stopTour(); map.stop(); },
    onResume: () => { vehicleMotion.finish(); aircraftMotion.finish(); refreshAll(); rebuildLayers(); },
  });
  // Recompute viewport activity after a camera move, not on each animation frame.
  map.on('moveend', () => updateBriefing(state, map));

  let started = false;
  map.on('style.load', () => {
    if (currentBasemap === 'streets') { removeHillshadeLayers(map); applyNightStyle(map); }
    if (config.TOMTOM_API_KEY || config.TRAFFIC_PROXY) {
      addTrafficLayer(map, trafficTileUrl(config));
      map.setLayoutProperty('tomtom-traffic-flow', 'visibility', state.visible.traffic ? 'visible' : 'none');
    }
    if (!started) {
      started = true;
      refreshAll();
      setInterval(refreshTransport, POLL_MS.transport);
      setInterval(refreshAircraft, POLL_MS.aircraft);
      setInterval(refreshWeather, 300_000);
      setInterval(refreshRadar, 600_000);
      setInterval(() => { if (!document.hidden) { updateUI(); rebuildLayers(); } }, 5000);
    }
  });
  updateUI();
}

init().catch(() => {
  document.getElementById('insight-transport-title').textContent = 'Unable to start the live map';
  document.getElementById('insight-transport-detail').textContent = 'Check local configuration and the API proxy, then reload.';
  document.getElementById('city-briefing').open = true;
});
