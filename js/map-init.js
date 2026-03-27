// js/map-init.js
// Initialises MapLibre GL and attaches deck.gl MapboxOverlay.
// Depends on window.maplibregl and window.deck (UMD globals from index.html).

export function initMap(maptilerKey, onLayerClick) {
  const map = new maplibregl.Map({
    container: 'map',
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`,
    center: [174.7570, -36.8438],  // [lng, lat] — Victoria Park Market
    zoom: 12,
    pitch: 50,
    bearing: 160,
    antialias: true,
  });

  // deck.gl overlay — synchronises camera with MapLibre
  const overlay = new deck.MapboxOverlay({
    interleaved: false,
    layers: [],
    onClick: onLayerClick ?? null,
  });

  map.addControl(overlay);

  // streets-v2 includes a hillshade raster layer whose tile source has a
  // maxzoom cap. With pitch 50° the near-ground horizon requests tiles beyond
  // that cap, producing "Zoom Level Not Supported" tile images. Remove any
  // hillshade/raster-dem layers once the style loads to prevent this.
  map.on('load', () => {
    const toRemove = map.getStyle().layers
      .filter(l => l.type === 'hillshade' || l.type === 'raster')
      .map(l => l.id);
    toRemove.forEach(id => {
      try { map.removeLayer(id); } catch {}
    });
  });

  return { map, overlay };
}

export function setLayers(overlay, layers) {
  overlay.setProps({ layers });
}
