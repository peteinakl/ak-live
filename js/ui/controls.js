// js/ui/controls.js

export function initControls({ onTransportToggle, onAircraftToggle, onWeatherToggle }) {
  document.getElementById('toggle-transport').addEventListener('change', e => {
    onTransportToggle(e.target.checked);
  });
  document.getElementById('toggle-aircraft').addEventListener('change', e => {
    onAircraftToggle(e.target.checked);
  });
  document.getElementById('toggle-weather').addEventListener('change', e => {
    onWeatherToggle(e.target.checked);
  });
}

export function initBasemapToggle(onBasemapChange) {
  const btnStreets = document.getElementById('basemap-streets');
  const btnAerial  = document.getElementById('basemap-aerial');

  function setActive(basemap) {
    btnStreets.classList.toggle('active', basemap === 'streets');
    btnAerial.classList.toggle('active',  basemap === 'aerial');
  }

  btnStreets.addEventListener('click', () => { setActive('streets'); onBasemapChange('streets'); });
  btnAerial.addEventListener('click',  () => { setActive('aerial');  onBasemapChange('aerial'); });

  setActive('streets');
}

export function updateCounts({ transport, aircraft }) {
  document.getElementById('count-transport').textContent = transport;
  document.getElementById('count-aircraft').textContent = aircraft;
}
