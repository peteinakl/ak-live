// js/map-init.js
// Initialises MapLibre GL and attaches deck.gl MapboxOverlay.
// Depends on window.maplibregl and window.deck (UMD globals from index.html).

export function buildStreetsStyle(maptilerKey) {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
}

export function buildAerialStyle(linzKey) {
  return {
    version: 8,
    sources: {
      'linz-aerial': {
        type: 'raster',
        tiles: [`https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${linzKey}`],
        tileSize: 256,
        maxzoom: 20,
        attribution: '© <a href="https://www.linz.govt.nz" target="_blank">LINZ</a> CC BY 4.0',
      },
    },
    layers: [{ id: 'linz-aerial-layer', type: 'raster', source: 'linz-aerial' }],
  };
}

// streets-v2 includes a hillshade layer whose tile source has a maxzoom cap.
// At pitch 50° the near-ground horizon requests tiles beyond that cap, producing
// "Zoom Level Not Supported" images. Remove those layers after each style load.
// Filter is hillshade/raster-dem only — NOT generic 'raster' — so the LINZ
// aerial layer is never accidentally removed.
export function removeHillshadeLayers(map) {
  const toRemove = map.getStyle().layers
    .filter(l => l.type === 'hillshade' || l.type === 'raster-dem')
    .map(l => l.id);
  toRemove.forEach(id => { try { map.removeLayer(id); } catch {} });
}

export function initMap(maptilerKey, onLayerClick) {
  const map = new maplibregl.Map({
    container: 'map',
    style: buildStreetsStyle(maptilerKey),
    center: [174.7570, -36.8438],  // [lng, lat] — Victoria Park Market
    zoom: 12,
    minZoom: 7,
    pitch: 50,
    bearing: 160,
    antialias: true,
    // Constrain to NZ North Island — data coverage is Auckland-only
    maxBounds: [172.5, -41.7, 178.6, -34.3],
  });

  // deck.gl overlay — synchronises camera with MapLibre
  const overlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: [],
    onClick: onLayerClick ?? null,
  });

  map.addControl(overlay);

  return { map, overlay };
}

export function setLayers(overlay, layers) {
  overlay.setProps({ layers });
}

export function addTrafficLayer(map, tomtomKey) {
  if (!map.getSource('tomtom-traffic')) {
    map.addSource('tomtom-traffic', {
      type: 'raster',
      tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}&tileSize=256`],
      tileSize: 256,
      attribution: '© <a href="https://www.tomtom.com" target="_blank">TomTom</a>',
    });
  }
  if (!map.getLayer('tomtom-traffic-flow')) {
    map.addLayer({
      id: 'tomtom-traffic-flow',
      type: 'raster',
      source: 'tomtom-traffic',
      paint: { 'raster-opacity': 0.75 },
    });
  }
}
