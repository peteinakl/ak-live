// js/ui/idle.js — Pauses live polling after a stretch without interaction, so
// a forgotten tab on the shared demo doesn't keep spending API quota.
const IDLE_MS = 5 * 60_000;

export function initIdle({ onPause, onResume }) {
  const overlay = document.getElementById('idle-overlay');
  let paused = false;
  let timer = null;

  function arm() {
    clearTimeout(timer);
    timer = setTimeout(pause, IDLE_MS);
  }

  function pause() {
    paused = true;
    overlay.hidden = false;
    onPause();
  }

  function activity() {
    if (paused) {
      paused = false;
      overlay.hidden = true;
      onResume();
    }
    arm();
  }

  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(event, activity, { capture: true, passive: true });
  }
  arm();
  return { isPaused: () => paused };
}
