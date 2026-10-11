// js/map-init.js
// Initialises MapLibre GL and attaches deck.gl MapboxOverlay.
// Depends on window.maplibregl and window.deck (UMD globals from index.html).

export function buildStreetsStyle(maptilerKey) {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
}

// Recolour the existing tile style so roads and neighbourhoods provide context
// without competing with the live layers. No extra tile source is required.
export function applyNightStyle(map) {
  for (const layer of map.getStyle().layers) {
    const id = layer.id.toLowerCase();
    if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#091421');
    if (layer.type === 'fill') {
      const color = /water/.test(id) ? '#0b2537' : /park|wood|landcover|grass/.test(id) ? '#102b2c'
        : /building/.test(id) ? '#233547' : '#142131';
      map.setPaintProperty(layer.id, 'fill-color', color);
      map.setPaintProperty(layer.id, 'fill-outline-color', color);
    }
    if (layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', /motorway|trunk/.test(id) ? '#405264' : '#2b3b4c');
    }
    if (layer.type === 'fill-extrusion') map.setPaintProperty(layer.id, 'fill-extrusion-color', '#26394b');
    if (layer.type === 'symbol') {
      if (/poi|housenumber/.test(id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
      else {
        map.setPaintProperty(layer.id, 'text-color', /place|settlement/.test(id) ? '#afc5d5' : '#7d96a9');
        map.setPaintProperty(layer.id, 'text-halo-color', '#101e2c');
        map.setPaintProperty(layer.id, 'text-halo-width', 1.2);
      }
    }
  }
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

export function initMap(style, initialView, onLayerClick) {
  const map = new maplibregl.Map({
    container: 'map',
    style,
    ...initialView,  // { center, zoom, pitch, bearing } of the opening scene
    minZoom: 7,
    antialias: true,
    // Constrain to NZ North Island — data coverage is Auckland-only
    maxBounds: [172.5, -41.7, 178.6, -34.3],
  });

  // deck.gl overlay — synchronises camera with MapLibre
  const overlay = new deck.MapboxOverlay({
    interleaved: false,
    pickingRadius: 8,
    layers: [],
    onClick: onLayerClick ?? null,
  });

  map.addControl(overlay);

  return { map, overlay };
}

export function setLayers(overlay, layers) {
  overlay.setProps({ layers });
}

// Locally tiles come straight from TomTom; the shared demo proxies them through
// the Worker (key stays server-side). Bounds and maxzoom match the Worker's
// limits, so MapLibre overzooms past z15 rather than requesting more tiles.
export function trafficTileUrl(config) {
  return config.TRAFFIC_PROXY
    ? `${location.origin}/api/traffic/{z}/{x}/{y}.png`
    : `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${config.TOMTOM_API_KEY}&tileSize=256`;
}

export function addTrafficLayer(map, tileUrl) {
  if (!map.getSource('tomtom-traffic')) {
    map.addSource('tomtom-traffic', {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: 10,
      maxzoom: 15,
      bounds: [174.2, -37.5, 175.6, -36.2],
      attribution: '© <a href="https://www.tomtom.com" target="_blank">TomTom</a>',
    });
  }
  if (!map.getLayer('tomtom-traffic-flow')) {
    map.addLayer({
      id: 'tomtom-traffic-flow',
      type: 'raster',
      source: 'tomtom-traffic',
      paint: { 'raster-opacity': 0.42 },
    });
  }
}
