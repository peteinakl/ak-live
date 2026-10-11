export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function ageLabel(timestamp, now = Date.now()) {
  if (!timestamp) return 'No observation time';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}
