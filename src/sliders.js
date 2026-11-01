import { state } from './state.js';
import { lockReason } from './bones.js';
import { sliderMax } from './limits.js';

// fam = the bone family a slider needs (see bones.js). Those sliders stay locked until its joint points are placed.
// split = the slider can be split into Left and Right when the Symmetry lock is off.
export const SLIDERS = [
  { key: 'head', label: 'Head size' },
  { key: 'shoulder', label: 'Shoulder width', split: true },
  { key: 'waist', label: 'Waist width', split: true },
  { key: 'hip', label: 'Hip width', split: true },
  { key: 'thigh', label: 'Thigh thickness', split: true },
  { key: 'calf', label: 'Calf thickness', split: true },
  { key: 'torso', label: 'Torso length' },
  { key: 'leg', label: 'Leg length' },
  { key: 'height', label: 'Overall height' },
  { key: 'neckLen', label: 'Neck length', fam: 'neck', group: 'Head and neck (need neck points)' },
  { key: 'neckThick', label: 'Neck thickness', fam: 'neck' },
  { key: 'chestSize', label: 'Chest size', fam: 'chest', split: true, group: 'Upper body (need chest points)' },
  { key: 'chestLift', label: 'Chest lift', fam: 'chest', split: true },
  { key: 'uarmLen', label: 'Upper arm length', fam: 'uarm', split: true, group: 'Arms (need joint points)' },
  { key: 'farmLen', label: 'Forearm length', fam: 'farm', split: true },
  { key: 'uarmThick', label: 'Upper arm thickness', fam: 'uarm', split: true },
  { key: 'farmThick', label: 'Forearm thickness', fam: 'farm', split: true },
  { key: 'handSize', label: 'Hand size', fam: 'hand', split: true },
  { key: 'thighLen', label: 'Thigh length', fam: 'thigh', split: true, group: 'Legs (need joint points)' },
  { key: 'calfLen', label: 'Calf length', fam: 'calf', split: true },
  { key: 'footSize', label: 'Foot size', fam: 'foot', split: true }
];

const UI = new Map();     // slider key -> { row, input, out }. Every row, including Left / Right rows and custom parts.
const locked = new Set(); // base keys of sliders that are locked right now
let customs = [];         // Phase 13: sliders for custom parts, { key, label, id }
let handlers = null;      // { onInput, onCommit } from initSliders
let creative = false;     // Phase 14: Creative range on?
let split = false;        // Phase 14: Symmetry lock off?

const baseOf = key => key.split(':')[0];
const idOf = key => 'sl-' + key.replace(':', '-'); // 'shoulder:L' -> 'sl-shoulder-L'

function makeRow(root, key, label, cls, onRemove) {
  const row = document.createElement('div');
  row.className = 'sl ' + cls;
  row.innerHTML = `<label for="${idOf(key)}"></label><output>0</output>` +
    `<button type="button" class="rs" title="Reset" aria-label="Reset">↺</button>` +
    (onRemove ? `<button type="button" class="rm" title="Remove this part" aria-label="Remove this part">✕</button>` : '') +
    `<input id="${idOf(key)}" type="range" min="-100" max="100" step="1" value="0">` +
    `<small class="why" hidden></small>`;
  row.querySelector('label').textContent = label; // text, so a typed name can never be read as HTML
  const rs = row.querySelector('.rs');
  rs.title = rs.ariaLabel = 'Reset ' + label;
  const input = row.querySelector('input'), out = row.querySelector('output');
  const set = v => {
    input.value = v;
    out.textContent = input.value;
    state.values[key] = +input.value;
    if (key !== baseOf(key)) { // a Left / Right slider: keep the plain value as their average (for presets and history)
      const b = baseOf(key), avg = Math.round(((state.values[b + ':L'] || 0) + (state.values[b + ':R'] || 0)) / 2);
      if (avg) state.values[b] = avg; else delete state.values[b];
    }
  };
  input.addEventListener('input', () => { set(input.value); handlers.onInput(); });
  input.addEventListener('change', () => handlers.onCommit());
  const reset = () => { set(0); handlers.onInput(); handlers.onCommit(); }; // one slider back to 0 (button, or double click)
  rs.addEventListener('click', reset);
  input.addEventListener('dblclick', reset);
  if (onRemove) row.querySelector('.rm').addEventListener('click', onRemove);
  root.appendChild(row);
  UI.set(key, { row, input, out });
  return row;
}

// onInput: called while dragging (redraw). onCommit: called when a change is finished (history).
export function initSliders(root, h) {
  handlers = h;
  root.innerHTML = '';
  UI.clear();
  customs = [];
  root.dataset.split = '0';
  for (const s of SLIDERS) {
    if (s.group) {
      const t = document.createElement('h3');
      t.className = 'sl-group';
      t.textContent = s.group;
      root.appendChild(t);
    }
    makeRow(root, s.key, s.label, s.split ? 'sl-main' : '');
    if (s.split) {
      makeRow(root, s.key + ':L', s.label + ' (left)', 'sl-side');
      makeRow(root, s.key + ':R', s.label + ' (right)', 'sl-side');
    }
  }
  applyRanges(root, false);
}

// Phase 13: one size slider for a custom part. onRemove(part) is called when the user presses its ✕.
export function addCustomSlider(root, part, onRemove) {
  if (!customs.length) {
    const t = document.createElement('h3');
    t.className = 'sl-group';
    t.id = 'custom-head';
    t.textContent = 'Custom parts';
    root.appendChild(t);
  }
  const s = { key: 'part_' + part.id, label: part.name + ' size', id: part.id };
  customs.push(s);
  makeRow(root, s.key, s.label, '', () => onRemove(part));
  applyRanges(root, creative);
}
export function removeCustomSlider(root, id) {
  const s = customs.find(c => c.id === id);
  if (!s) return;
  UI.get(s.key).row.remove();
  UI.delete(s.key);
  customs = customs.filter(c => c !== s);
  delete state.values[s.key];
  if (!customs.length) root.querySelector('#custom-head')?.remove();
}
export function clearCustomSliders(root) {
  for (const s of [...customs]) removeCustomSlider(root, s.id);
}

// Locks the sliders whose joint points are missing, and says what is missing. Call when the shape screen opens.
export function updateLocks(root) {
  locked.clear();
  for (const s of SLIDERS) {
    if (!s.fam) continue;
    const why = lockReason(s.fam);
    if (why) locked.add(s.key);
    for (const [key, ui] of UI) {
      if (baseOf(key) !== s.key) continue;
      ui.row.classList.toggle('locked', !!why);
      ui.input.disabled = ui.row.querySelector('.rs').disabled = !!why;
      const note = ui.row.querySelector('.why');
      note.textContent = why;
      note.hidden = !why;
    }
  }
  setSliderValues(root, state.values); // a locked slider goes back to 0
}

// Phase 14: Realistic or Creative range. Realistic stops each slider early (and the whole track is green).
// Creative opens the full slider; the part outside the Realistic range is orange.
const GREEN = '#9fd8ae', ORANGE = '#f2b366';
export function applyRanges(root, isCreative) {
  creative = isCreative;
  for (const [key, ui] of UI) {
    const max = sliderMax(key, creative), g = sliderMax(key, false);
    ui.input.min = -max;
    ui.input.max = max;
    const x1 = 50 - g / 2, x2 = 50 + g / 2; // where the green part starts and ends along a -100..100 track
    ui.input.style.setProperty('--track', creative
      ? `linear-gradient(90deg, ${ORANGE} 0 ${x1}%, ${GREEN} ${x1}% ${x2}%, ${ORANGE} ${x2}% 100%)`
      : GREEN);
  }
  return setSliderValues(root, state.values); // values outside the new range are pulled back in
}

// Phase 14: the Symmetry lock. On = one slider for both sides. Off = a Left and a Right slider each.
export function setSplit(root, on) {
  if (split === on) return;
  split = on;
  root.dataset.split = on ? '1' : '0';
  for (const s of SLIDERS) {
    if (!s.split) continue;
    const v = state.values[s.key] || 0, l = state.values[s.key + ':L'], r = state.values[s.key + ':R'];
    if (on) {
      if (v && l === undefined && r === undefined) { state.values[s.key + ':L'] = v; state.values[s.key + ':R'] = v; }
    } else {
      const avg = Math.round(((l || 0) + (r || 0)) / 2); // locking again: left and right become their average
      if (l !== undefined || r !== undefined) { if (avg) state.values[s.key] = avg; else delete state.values[s.key]; }
      delete state.values[s.key + ':L'];
      delete state.values[s.key + ':R'];
    }
  }
  setSliderValues(root, state.values);
}
export const isSplit = () => split;

// Put the sliders (and the state) to the given values. Returns how many were pulled back into the current range.
export function setSliderValues(root, vals) {
  const raw = { ...vals };
  state.values = {};
  let clamped = 0;
  for (const [key, ui] of UI) {
    const b = baseOf(key), isSide = key !== b;
    let v = raw[key];
    if (isSide) {
      if (!split) v = 0; // hidden rows
      else if (raw[b + ':L'] === undefined && raw[b + ':R'] === undefined) v = raw[b]; // values saved with the lock on
    }
    v = Math.round(Number(v) || 0);
    if (locked.has(b)) v = 0;
    const max = sliderMax(key, creative);
    if (Math.abs(v) > max) { v = Math.sign(v) * max; clamped++; }
    ui.input.value = v;
    ui.out.textContent = String(v);
    if (v) state.values[key] = v;
  }
  if (split) { // the plain value of a split slider is the average of its two sides
    for (const s of SLIDERS) if (s.split) {
      const avg = Math.round(((state.values[s.key + ':L'] || 0) + (state.values[s.key + ':R'] || 0)) / 2);
      if (avg) state.values[s.key] = avg; else delete state.values[s.key];
    }
  }
  return clamped;
}
