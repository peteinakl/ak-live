// js/ui/detail-panel.js
const panel = document.getElementById('detail-panel');
const panelBody = document.getElementById('detail-panel-body');
const panelClose = document.getElementById('detail-panel-close');

panelClose.addEventListener('click', hidePanel);

export function hidePanel() {
  panel.classList.remove('open');
}

export function showTransportDetail(vehicle) {
  const speedKmh = vehicle.speed != null ? `${Math.round(vehicle.speed * 3.6)} km/h` : 'n/a';

  // Build a useful title: prefer named vehicle or route number over raw ID
  const title = vehicle.vehicleLabel ||
    (vehicle.routeLabel ? `Route ${vehicle.routeLabel}` : `Vehicle ${vehicle.vehicleId}`);

  const rows = [];
  if (vehicle.routeLabel)    rows.push(`<span class="detail-label">Route</span><span>${vehicle.routeLabel}</span>`);
  if (vehicle.routeId)       rows.push(`<span class="detail-label">Route ID</span><span>${vehicle.routeId}</span>`);
  if (vehicle.startTime)     rows.push(`<span class="detail-label">Trip start</span><span>${vehicle.startTime}</span>`);
  if (vehicle.directionId != null) rows.push(`<span class="detail-label">Direction</span><span>${vehicle.directionId === 0 ? '→ Outbound' : '← Inbound'}</span>`);
  rows.push(`<span class="detail-label">Vehicle ID</span><span>${vehicle.vehicleId}</span>`);
  rows.push(`<span class="detail-label">Speed</span><span>${speedKmh}</span>`);
  rows.push(`<span class="detail-label">Bearing</span><span>${Math.round(Number(vehicle.bearing))}°</span>`);

  panelBody.innerHTML = `
    <div class="detail-type bus">Transit Vehicle</div>
    <div class="detail-title">${title}</div>
    <div class="detail-grid">${rows.join('')}</div>`;
  panel.classList.add('open');
}

export function showAircraftDetail(aircraft) {
  const altM = Math.round(aircraft.altitude);
  const altFt = Math.round(aircraft.altitude * 3.281);
  const speedKts = aircraft.velocity != null ? `${Math.round(aircraft.velocity * 1.944)} kts` : 'n/a';
  const status = aircraft.onGround ? 'On ground' : `${altM} m / ${altFt} ft`;
  const vertRate = aircraft.vertRate != null
    ? (aircraft.vertRate > 0.5 ? '↑ climbing' : aircraft.vertRate < -0.5 ? '↓ descending' : '→ level')
    : 'n/a';

  panelBody.innerHTML = `
    <div class="detail-type aircraft">Aircraft</div>
    <div class="detail-title">${aircraft.callsign || aircraft.icao24}</div>
    <div class="detail-grid">
      <span class="detail-label">ICAO24</span><span>${aircraft.icao24}</span>
      <span class="detail-label">Altitude</span><span>${status}</span>
      <span class="detail-label">Speed</span><span>${speedKts}</span>
      <span class="detail-label">Heading</span><span>${Math.round(aircraft.heading)}°</span>
      <span class="detail-label">Vertical</span><span>${vertRate}</span>
    </div>`;
  panel.classList.add('open');
}
