// js/main.js — App orchestrator
import { loadConfig }                                        from './utils/config.js';
import { initMap, setLayers,
         buildStreetsStyle, buildAerialStyle,
         removeHillshadeLayers, addTrafficLayer }            from './map-init.js';
import { fetchTransportData,
         buildTransportLayer,
         buildTransportTrailLayer }                          from './layers/transport.js';
import { fetchAircraftData,
         buildAircraftLayer,
         buildAircraftTrailLayer }                           from './layers/aircraft.js';
import { fetchWeatherData, updateWeatherHUD,
         fetchRadarInfo, buildRadarLayer }                   from './layers/weather.js';
import { initControls, updateCounts,
         initBasemapToggle }                                 from './ui/controls.js';
import { setWeatherHudVisible }                              from './ui/hud.js';
import { showTransportDetail, showAircraftDetail,
         hidePanel }                                         from './ui/detail-panel.js';

// --- App state ---
const state = {
  vehicles: [],
  aircraft: [],
  vehicleTrails: new Map(),
  aircraftTrails: new Map(),
  radarInfo: null,
  visible: { transport: true, aircraft: true, weather: true, traffic: true },
};

const MAX_TRAIL_POINTS = 15; // 15 × 10 s = 2.5 min — time-based fading handles visual cutoff

let overlay        = null;
let currentBasemap = 'streets';
let _appStarted    = false;
let _maptilerKey   = null;
let _linzKey       = null;
let _tomtomKey     = null;

// --- Trail history update ---
// Each function only updates its own trail map to avoid double-appending
// when transport and aircraft polls interleave.
function updateVehicleTrails(vehicles) {
  const seen = new Set(vehicles.map(v => v.id));
  for (const v of vehicles) {
    const hist = state.vehicleTrails.get(v.id) ?? [];
    hist.push({ position: v.position, routeId: v.routeId, ts: Date.now() });
    if (hist.length > MAX_TRAIL_POINTS) hist.shift();
    state.vehicleTrails.set(v.id, hist);
  }
  for (const id of state.vehicleTrails.keys()) {
    if (!seen.has(id)) state.vehicleTrails.delete(id);
  }
}

function updateAircraftTrails(aircraft) {
  const seen = new Set(aircraft.map(a => a.icao24));
  for (const a of aircraft) {
    const hist = state.aircraftTrails.get(a.icao24) ?? [];
    hist.push({ position: a.position, altitude: a.altitude, onGround: a.onGround });
    if (hist.length > MAX_TRAIL_POINTS) hist.shift();
    state.aircraftTrails.set(a.icao24, hist);
  }
  for (const id of state.aircraftTrails.keys()) {
    if (!seen.has(id)) state.aircraftTrails.delete(id);
  }
}

// --- Click handler ---
function onLayerClick({ object, layer }) {
  if (!object) { hidePanel(); return; }
  if (layer.id === 'transport-layer') showTransportDetail(object);
  if (layer.id === 'aircraft-layer')  showAircraftDetail(object);
}

// --- Layer rebuild ---
// Order: radar → trails → dots (each group renders above the previous)
function rebuildLayers() {
  if (!overlay) return;
  const layers = [
    buildRadarLayer(state.radarInfo, state.visible.weather),
    buildTransportTrailLayer(state.vehicleTrails, state.visible.transport),
    buildAircraftTrailLayer(state.aircraftTrails,  state.visible.aircraft),
    buildTransportLayer(state.vehicles,            state.visible.transport),
    buildAircraftLayer(state.aircraft,             state.visible.aircraft),
  ].filter(Boolean);
  setLayers(overlay, layers);
  updateCounts({
    transport: state.vehicles.length,
    aircraft:  state.aircraft.length,
  });
}

// --- Data refresh ---
async function refreshTransport() {
  try {
    state.vehicles = await fetchTransportData();
    updateVehicleTrails(state.vehicles);
    rebuildLayers();
  } catch (err) {
    console.warn('[transport] fetch failed, keeping last data:', err.message);
  }
}

async function refreshAircraft() {
  try {
    state.aircraft = await fetchAircraftData();
    updateAircraftTrails(state.aircraft);
    rebuildLayers();
  } catch (err) {
    console.warn('[aircraft] fetch failed, keeping last data:', err.message);
  }
}

async function refreshWeather() {
  try {
    const data = await fetchWeatherData();
    updateWeatherHUD(data);
  } catch (err) {
    console.warn('[weather] fetch failed:', err.message);
  }
}

// --- Polling scheduler ---
function startPolling() {
  refreshTransport();
  refreshAircraft();
  refreshWeather();

  setInterval(refreshTransport, 10_000);
  setInterval(refreshAircraft,  10_000);
  setInterval(refreshWeather,   300_000);
}

// --- Init ---
async function init() {
  const config = await loadConfig();
  _maptilerKey = config.MAPTILER_KEY;
  _linzKey     = config.LINZ_API_KEY;
  _tomtomKey   = config.TOMTOM_API_KEY;

  const { map, overlay: deckOverlay } = initMap(config.MAPTILER_KEY, onLayerClick);
  overlay = deckOverlay;

  initControls({
    onTransportToggle: v => { state.visible.transport = v; rebuildLayers(); },
    onAircraftToggle:  v => { state.visible.aircraft  = v; rebuildLayers(); },
    onWeatherToggle:   v => { state.visible.weather   = v; setWeatherHudVisible(v); rebuildLayers(); },
    onTrafficToggle:   v => { state.visible.traffic   = v; map.setLayoutProperty('tomtom-traffic-flow', 'visibility', v ? 'visible' : 'none'); },
  });

  function onBasemapChange(basemap) {
    if (basemap === currentBasemap) return;
    currentBasemap = basemap;
    map.setStyle(basemap === 'aerial' ? buildAerialStyle(_linzKey) : buildStreetsStyle(_maptilerKey));
  }

  initBasemapToggle(onBasemapChange);

  map.on('style.load', async () => {
    if (currentBasemap === 'streets') removeHillshadeLayers(map);
    addTrafficLayer(map, _tomtomKey);
    map.setLayoutProperty('tomtom-traffic-flow', 'visibility', state.visible.traffic ? 'visible' : 'none');
    if (!_appStarted) {
      _appStarted = true;
      state.radarInfo = await fetchRadarInfo();
      startPolling();
    }
  });
}

init().catch(err => {
  console.error('[main] Fatal init error:', err);
  document.body.innerHTML = `
    <div style="color:#f88;padding:40px;font-family:monospace;background:#0a0a0f;height:100vh">
      <h2 style="margin-bottom:16px">Auckland Live — Init Error</h2>
      <pre style="white-space:pre-wrap;color:#faa">${err.message}</pre>
      <p style="margin-top:20px;color:#607080">
        Make sure:<br>
        1. config.local.js exists with your API keys<br>
        2. proxy is running: <code style="color:#7fd8ff">node proxy.js</code><br>
        3. Serving with: <code style="color:#7fd8ff">npx serve .</code>
      </p>
    </div>`;
});
