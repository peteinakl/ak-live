export const SCENES = {
  harbour: { title: 'Waitematā Harbour', center: [174.773, -36.828], zoom: 12.8, pitch: 50, bearing: 145 },
  city: { title: 'The heart of Auckland', center: [174.763, -36.848], zoom: 14.2, pitch: 55, bearing: 160 },
  airport: { title: 'Auckland from above', center: [174.79, -37.008], zoom: 12.8, pitch: 40, bearing: 15 },
  region: { title: 'The greater Auckland region', center: [174.82, -36.88], zoom: 10, pitch: 15, bearing: 0 },
};

// Opening view. The initial camera (map-init.js) and the title/button state in
// index.html must match this scene.
export const DEFAULT_SCENE = 'city';

export function initScenes(map, { onSelect, stopTracking, reducedMotion }) {
  let timer = null;
  let current = DEFAULT_SCENE;
  const tour = document.getElementById('tour-toggle');
  const buttons = [...document.querySelectorAll('[data-scene]')];
  const title = document.getElementById('scene-title');

  function stopTour() {
    clearInterval(timer);
    timer = null;
    tour.setAttribute('aria-pressed', 'false');
    tour.setAttribute('aria-label', 'Start Auckland tour');
    tour.textContent = '▷';
  }

  function select(id, fromTour = false) {
    if (!SCENES[id]) return;
    if (!fromTour) stopTour();
    stopTracking();
    current = id;
    const { title: label, ...view } = SCENES[id];
    title.textContent = label;
    for (const button of buttons) {
      const active = button.dataset.scene === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    onSelect(id);
    map.flyTo({ ...view, duration: reducedMotion.matches ? 0 : 2200 });
  }

  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.scene)));
  tour.addEventListener('click', () => {
    if (timer) { stopTour(); map.stop(); return; }
    const sequence = Object.keys(SCENES);
    select(current, true);
    tour.textContent = 'Ⅱ';
    tour.setAttribute('aria-pressed', 'true');
    tour.setAttribute('aria-label', 'Stop Auckland tour');
    timer = setInterval(() => select(sequence[(sequence.indexOf(current) + 1) % sequence.length], true), 14_000);
  });
  for (const event of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
    map.on(event, e => { if (e.originalEvent) stopTour(); });
  }
  map.on('click', e => { if (e.originalEvent) stopTour(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTour(); });
  return { select, stopTour };
}
