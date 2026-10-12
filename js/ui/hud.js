// js/ui/hud.js

export function initWeatherHud() {
  const hud = document.getElementById('weather-hud');
  const compact = matchMedia('(max-width: 600px)');
  let timer;
  let ready = false;
  let introFinished = false;

  function finishIntro() {
    clearTimeout(timer);
    introFinished = true;
  }

  function scheduleIntro() {
    clearTimeout(timer);
    if (!compact.matches || introFinished || hud.style.display === 'none') return;
    // Allow five seconds to read loaded weather; also tuck away if the feed fails.
    timer = setTimeout(() => {
      hud.open = false;
      finishIntro();
    }, ready ? 5000 : 10000);
  }

  function adapt() {
    hud.open = !compact.matches || !introFinished;
    scheduleIntro();
  }

  // Respect someone reading, scrolling the forecast, or using the keyboard.
  hud.addEventListener('pointerdown', finishIntro);
  hud.addEventListener('focusin', finishIntro);
  compact.addEventListener('change', adapt);
  adapt();

  return {
    dataLoaded() {
      if (ready) return;
      ready = true;
      scheduleIntro();
    },
    setVisible(visible) {
      finishIntro();
      hud.style.display = visible ? '' : 'none';
      if (visible) hud.open = true;
    },
  };
}
