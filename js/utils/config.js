// js/utils/config.js
let _config = null;

export async function loadConfig() {
  if (_config) return _config;

  try {
    const mod = await import('/config.local.js');
    _config = mod.CONFIG;
  } catch {
    throw new Error(
      'config.local.js not found.\n' +
      'Copy config.local.example.js → config.local.js and fill in your API keys.\n' +
      'Then serve with: npx serve .'
    );
  }

  return _config;
}

export function getConfig() {
  if (!_config) throw new Error('Config not loaded. Await loadConfig() first.');
  return _config;
}
