// js/layers/weather.js
import { fetchWeather } from '../utils/api-client.js';

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=-36.85&longitude=174.76' +
  '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,' +
  'wind_direction_10m,weather_code,cloud_cover,pressure_msl' +
  '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,' +
  'wind_direction_10m,weather_code' +
  '&timezone=Pacific%2FAuckland';

const WMO_ICON = {
  0: '☀',  1: '🌤', 2: '⛅', 3: '☁',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌦', 63: '🌧', 65: '🌧',
  71: '🌨', 73: '🌨', 75: '❄',
  80: '🌦', 81: '🌧', 82: '🌧',
  95: '⛈',  96: '⛈',  99: '⛈',
};

const WMO_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Slight showers', 81: 'Showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Heavy thunderstorm',
};

function windDir(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export async function fetchWeatherData() {
  return fetchWeather(WEATHER_URL);
}

export function updateWeatherHUD(data) {
  const c = data.current;
  document.getElementById('hud-temp').textContent =
    `${Math.round(c.temperature_2m)}°C`;
  document.getElementById('hud-desc').textContent =
    WMO_CODES[c.weather_code] ?? `Code ${c.weather_code}`;
  document.getElementById('hud-wind').textContent =
    `Wind ${Math.round(c.wind_speed_10m)} km/h ${windDir(c.wind_direction_10m)}`;
  document.getElementById('hud-humidity').textContent =
    `Humidity ${c.relative_humidity_2m}%`;
}

function fmtHour(iso) {
  const h = parseInt(iso.slice(11, 13), 10);
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function updateForecastStrip(data) {
  const strip = document.getElementById('forecast-strip');
  if (!strip || !data.hourly) return;

  // Find the first hourly slot at or after the current Auckland hour
  const currentHour = data.current.time.slice(0, 13); // "2026-03-28T14"
  const startIdx = data.hourly.time.findIndex(t => t.slice(0, 13) >= currentHour);
  if (startIdx === -1) return;

  const cells = [];
  for (let i = startIdx; i < Math.min(startIdx + 24, data.hourly.time.length); i++) {
    const temp = Math.round(data.hourly.temperature_2m[i]);
    const rain = data.hourly.precipitation_probability[i] ?? 0;
    const icon = WMO_ICON[data.hourly.weather_code[i]] ?? '?';
    cells.push(
      `<div class="fc-cell">` +
        `<div class="fc-time">${fmtHour(data.hourly.time[i])}</div>` +
        `<div class="fc-icon">${icon}</div>` +
        `<div class="fc-temp">${temp}°</div>` +
        `<div class="fc-rain${rain >= 30 ? ' wet' : ''}">${rain}%</div>` +
      `</div>`
    );
  }
  strip.innerHTML = cells.join('');
}

// --- Rain radar overlay via a single pre-calculated BitmapLayer ---
// TileLayer was requesting tiles at dynamic zoom levels which broke with
// RainViewer's zoom caps. This approach fetches one fixed tile at zoom 7
// covering Auckland (x=126, y=78) and renders it as a BitmapLayer with
// hard-coded geographic bounds — no dynamic tile requests, no zoom errors.
//
// Tile bounds (z=7, x=126, y=78):
//   west=174.375°  east=177.1875°  north=-36.598°  south=-38.823°

const RADAR_TILE = { z: 7, x: 126, y: 78 };
const RADAR_BOUNDS = [174.375, -38.8226, 177.1875, -36.5979]; // [W, S, E, N]

export async function fetchRadarInfo() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    const frames = data.radar?.past ?? [];
    if (!frames.length) return null;
    const latest = frames[frames.length - 1];
    const host = data.host ?? 'https://tilecache.rainviewer.com';
    const { z, x, y } = RADAR_TILE;
    return {
      tileUrl: `${host}${latest.path}/256/${z}/${x}/${y}/2/1_1.png`,
      bounds: RADAR_BOUNDS,
    };
  } catch (err) {
    console.warn('[weather] radar info fetch failed:', err.message);
    return null;
  }
}

export function buildRadarLayer(radarInfo, visible) {
  if (!radarInfo) return null;
  return new deck.BitmapLayer({
    id: 'rain-radar-layer',
    image: radarInfo.tileUrl,
    bounds: radarInfo.bounds,
    visible,
    opacity: 0.5,
  });
}
