// Saves slider looks in the browser (localStorage). Every call is safe if storage is blocked.
const KEY = 'bodyshaper.presets';

export function loadPresets() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter(p => p && typeof p.name === 'string' && p.values && typeof p.values === 'object') : [];
  } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export function savePreset(name, values) {
  const list = loadPresets().filter(p => p.name !== name); // same name = replace
  list.push({ name, values });
  return write(list.slice(-30));
}
export const deletePreset = name => write(loadPresets().filter(p => p.name !== name));
