import { ageLabel } from '../utils/format.js';

export function feedStatus(status, now = Date.now(), maxAge = 30_000) {
  if (!status?.updatedAt) return status?.error ? 'Unavailable' : 'Connecting';
  return `${status.error || now - status.updatedAt > maxAge ? 'Stale · ' : ''}${ageLabel(status.updatedAt, now)}`;
}

export function updateFreshness(feeds, radarInfo) {
  const now = Date.now();
  for (const [name, limit] of [['transport', 30_000], ['aircraft', 30_000], ['weather', 600_000]]) {
    const element = document.getElementById(`${name}-age`);
    element.textContent = feedStatus(feeds[name], now, limit);
    element.classList.toggle('stale', Boolean(feeds[name].error || (feeds[name].updatedAt && now - feeds[name].updatedAt > limit)));
    element.title = feeds[name].updatedAt ? `Last successful fetch: ${new Date(feeds[name].updatedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}` : 'Waiting for a successful feed response';
  }
  const radar = document.getElementById('radar-age');
  radar.textContent = radarInfo ? `Radar${feeds.radar.error ? ' stale' : ''} frame · ${ageLabel(radarInfo.ts * 1000)}` : 'Radar unavailable';
  radar.classList.toggle('stale', feeds.radar.error || !radarInfo || now - radarInfo.ts * 1000 > 1_200_000);
  document.getElementById('city-clock').textContent = new Date().toLocaleTimeString('en-NZ', {
    timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' · Auckland';
}

function setInsight(name, title, detail, disabled = false) {
  document.getElementById(`insight-${name}-title`).textContent = title;
  document.getElementById(`insight-${name}-detail`).textContent = detail;
  document.getElementById(`insight-${name}`).disabled = disabled;
}

export function updateBriefing({ vehicles, aircraft, weather, feeds }, map) {
  const now = Date.now();
  const bounds = map.getBounds();
  const fresh = entity => entity.timestamp && now - entity.timestamp < 120_000;
  const transit = vehicles.filter(v => fresh(v) && bounds.contains(v.position) && v.positionQuality !== 'rejected');
  const moving = transit.filter(v => v.speed !== null && v.speed > 1.4).length;
  const estimates = transit.filter(v => v.speed !== null).length;
  if (!feeds.transport.updatedAt || feeds.transport.error || now - feeds.transport.updatedAt > 30_000) {
    setInsight('transport', feeds.transport.updatedAt ? 'Transport feed is stale' : 'Transport is connecting', 'Live activity will appear when observations arrive', true);
  } else {
    setInsight('transport', `${transit.length.toLocaleString()} transit vehicles in view`,
      estimates ? `${moving} moving · ${estimates} GPS speed estimates · Explore the region` : 'Building GPS speed estimates · Explore the region');
  }

  const flying = aircraft.filter(a => fresh(a) && !a.onGround);
  const descending = flying.filter(a => a.vertRate !== null && a.vertRate < -0.5).length;
  if (!feeds.aircraft.updatedAt || feeds.aircraft.error || now - feeds.aircraft.updatedAt > 30_000) {
    setInsight('aircraft', feeds.aircraft.updatedAt ? 'Aircraft feed is stale' : 'Aircraft feed is connecting', 'Waiting for recent aircraft observations', true);
  } else {
    setInsight('aircraft', `${flying.length} aircraft airborne`, `${descending} descending in feed coverage · View the airport`);
  }

  if (!weather?.hourly || !feeds.weather.updatedAt || feeds.weather.error || now - feeds.weather.updatedAt > 600_000) {
    setInsight('weather', weather ? 'Forecast is stale' : 'Looking ahead', 'Waiting for a recent hourly forecast', true);
    return;
  }
  const currentHour = weather.current.time.slice(0, 13);
  const start = weather.hourly.time.findIndex(t => t.slice(0, 13) >= currentHour);
  const window = start < 0 ? [] : weather.hourly.precipitation_probability.slice(start, start + 6);
  const max = Math.max(0, ...window.filter(Number.isFinite));
  const peak = window.indexOf(max) + start;
  const hour = weather.hourly.time[peak]?.slice(11, 16);
  setInsight('weather', window.length ? `${max}% peak rain chance in the next 6h` : 'Hourly forecast available',
    hour ? `Peak at ${hour} · City-centre forecast · Open weather` : 'City-centre forecast · Open weather');
}
