import { state, newExt } from './state.js';
import { setupUpload } from './upload.js';
import { initLandmarks } from './landmarks.js';
import { initOverlays } from './overlays.js';
import { buildChains, neckBase, slot, J } from './bones.js';
import { heights, proportionHints } from './limits.js';
import { initBrush } from './zones.js';
import { buildBulges } from './bulge.js';
import { initParts } from './parts.js';
import { buildMesh, flatten, samplePos } from './mesh.js';
import { getAnchors, applyWarp } from './warp.js';
import { SLIDERS, initSliders, setSliderValues, updateLocks, addCustomSlider, removeCustomSlider, clearCustomSliders, applyRanges, setSplit } from './sliders.js';
import { initRenderer, setPicture, setGeometry, resize, draw } from './renderer.js';
import { commit, undo, redo, canUndo, canRedo, resetHistory } from './history.js';
import { loadPresets, savePreset, deletePreset } from './presets.js';
import { makePNG, exportSize, download } from './export.js';
import { toast, busy } from './ui.js';
import { initTutorial } from './tutorial.js';

const $ = id => document.getElementById(id);
const overlays = initOverlays($('stage'), $('bones'), $('guides'), $('meter')); // Phase 10: bones and capsules on the marking screen
const STEPS = { mark: 'Step 1 of 2: mark the body points', shape: 'Step 2 of 2: shape the body' };

try {
  initRenderer($('stage'), lost => (lost ? toast('Graphics paused. Please wait a moment…') : refresh()));
} catch (e) {
  $('drop').style.display = 'none';
  $('err').textContent = 'Your browser could not start 3D graphics (WebGL). Try the latest Chrome, Safari or Firefox, and check that hardware acceleration is on.';
}

function setScreen(name) {
  document.body.dataset.screen = name;
  $('step').textContent = STEPS[name] || '';
  hold(false);
  syncButtons();
  layout();
}

// Size the stage to the picture's shape, as big as fits.
function layout() {
  if (!state.img) return;
  const r = $('stage-wrap').getBoundingClientRect();
  const aw = r.width - 32, ah = r.height - 32;
  const w = Math.max(50, Math.min(aw, ah * state.aspect)), h = w / state.aspect;
  $('stage').style.width = w + 'px';
  $('stage').style.height = h + 'px';
  resize(w, h);
  overlays.redraw();
  refresh();
}

function refresh() {
  if (!state.mesh) return;
  const shape = document.body.dataset.screen === 'shape';
  let fit = 1, flat = true;
  if (shape) {
    if (state.compare || state.adding || state.painting) flatten(state.mesh, state.aspect); // show the original
    else { fit = applyWarp(state.mesh, state.anchors, state.values, state.aspect); flat = false; }
  }
  draw(fit, state.grid);
  if (shape) checks(fit, flat);
}

// Phase 14, step 6 of the order of operations: checks. Stretch meter, proportion guides and the hints.
function checks(fit, flat) {
  if (flat) { overlays.clearShape(); return; } // the original is on screen: nothing to check
  const stats = overlays.stretchMeter(state.mesh, fit, state.meter);
  const now = (u, v) => 0.5 - samplePos(state.mesh, u, v).y; // where a point of the original picture is now (picture height units)
  if (state.guides) overlays.drawGuides(heights(now), fit); else overlays.drawGuides(null, fit);
  const list = proportionHints(now, (u, v) => v);
  if (stats.folded > 2) list.push('The picture folds over itself in places. Lower the slider you moved last.');
  else if (stats.stretched >= Math.max(3, stats.total * 0.02)) list.push('Part of the picture is stretched by more than 35%. It may look soft or smeared there (turn on the Stretch meter to see where).');
  const box = $('hints');
  box.textContent = '';
  for (const m of list) { const li = document.createElement('li'); li.textContent = m; box.append(li); }
  box.hidden = !list.length;
}

// The settings the warp needs (Link strength, Symmetry lock, frozen zones). Call whenever one of them changes.
function syncAnchors() {
  const g = state.anchors;
  if (!g) return;
  g.link = state.link / 100;
  g.split = !state.sym;
  g.mask = state.mask;
}

new ResizeObserver(layout).observe($('stage-wrap'));

// ---- Phase 7: undo / redo, reset, compare, presets ----
const syncButtons = () => { $('sl-undo').disabled = !canUndo(); $('sl-redo').disabled = !canRedo(); };
const save = () => { commit(); syncButtons(); }; // call when a change is finished

initSliders($('sliders'), { onInput: refresh, onCommit: save });

function step(fn) {
  if (!fn()) return;
  setSliderValues($('sliders'), state.values);
  refresh();
  syncButtons();
}
$('sl-undo').addEventListener('click', () => step(undo));
$('sl-redo').addEventListener('click', () => step(redo));
document.addEventListener('keydown', e => {
  if (document.body.dataset.screen !== 'shape' || document.querySelector('dialog[open]') || e.target.matches('input[type=text]')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); step(e.shiftKey ? redo : undo); }
  else if (mod && k === 'y') { e.preventDefault(); step(redo); }
});

$('reset-all').addEventListener('click', () => {
  setSliderValues($('sliders'), {});
  save();
  refresh();
});

// Hold to compare: the original shows while the button is pressed.
function hold(on) {
  if (state.compare === on) return;
  state.compare = on;
  $('badge').hidden = !on;
  refresh();
}
const cmp = $('compare');
cmp.addEventListener('pointerdown', e => { cmp.setPointerCapture(e.pointerId); hold(true); });
['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(t => cmp.addEventListener(t, () => hold(false)));
cmp.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
cmp.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
cmp.addEventListener('contextmenu', e => e.preventDefault()); // long press on a phone

// Presets
const cleanValues = v => { // only known sliders, numbers from -100 to 100
  const o = {};
  for (const s of SLIDERS) {
    const n = Math.round(Number(v[s.key]));
    if (Number.isFinite(n) && n) o[s.key] = Math.max(-100, Math.min(100, n));
  }
  return o;
};
function renderPresets() {
  const box = $('preset-list'), list = loadPresets();
  box.textContent = '';
  $('preset-empty').hidden = list.length > 0;
  for (const p of list) {
    const li = document.createElement('li');
    const load = document.createElement('button');
    load.type = 'button'; load.className = 'pl'; load.textContent = p.name; load.title = 'Load this preset';
    load.addEventListener('click', () => {
      setSliderValues($('sliders'), cleanValues(p.values));
      save();
      refresh();
      toast('Loaded “' + p.name + '”');
    });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Delete preset ' + p.name);
    del.addEventListener('click', () => (deletePreset(p.name) ? renderPresets() : toast('Could not delete. Your browser may block storage.')));
    li.append(load, del);
    box.append(li);
  }
}
function saveCurrentPreset() {
  const name = $('preset-name').value.trim().slice(0, 30);
  if (!name) { toast('Type a name for the preset first.'); $('preset-name').focus(); return; }
  if (!savePreset(name, cleanValues(state.values))) { toast('Could not save. Your browser may block storage.'); return; }
  $('preset-name').value = '';
  renderPresets();
  toast('Saved “' + name + '”');
}
$('preset-save').addEventListener('click', saveCurrentPreset);
$('preset-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrentPreset(); });
renderPresets();

// ---- Phase 8: export ----
const dlg = $('export');
$('download').addEventListener('click', () => {
  const f = exportSize(true), p = exportSize(false);
  $('size-full').textContent = `Full size (${f[0]} × ${f[1]} px)`;
  $('size-prev').textContent = `Preview (${p[0]} × ${p[1]} px)`;
  dlg.showModal();
});
dlg.querySelectorAll('input[name=bg]').forEach(r => r.addEventListener('change', () => {
  $('bg-color').disabled = dlg.querySelector('input[name=bg]:checked').value !== 'solid';
}));
$('export-cancel').addEventListener('click', () => dlg.close());
$('export-go').addEventListener('click', async () => {
  const full = dlg.querySelector('input[name=size]:checked').value === 'full';
  const solid = dlg.querySelector('input[name=bg]:checked').value === 'solid';
  dlg.close();
  try {
    const blob = await busy('Making your picture…', () => makePNG({ full, bg: solid ? $('bg-color').value : null }));
    download(blob);
    toast('Your picture was downloaded.');
  } catch (e) {
    toast('Could not make the picture. Try the Preview size.');
  }
  refresh();
});

// The grid of dots: extra rows at the landmark heights and at every joint, and a finer grid when joints or parts exist.
function buildGrid() {
  const g = state.anchors, [, chin, sh, , , kn, ft] = g.a;
  const rows = [...g.a, g.crotch, (g.crotch + kn) / 2, (kn + ft) / 2, (chin + sh) / 2];
  state.mesh = state.ext.some(Boolean) || state.parts.length
    ? buildMesh(state.aspect, [...rows, ...state.ext.filter(Boolean).map(p => p.v), ...state.parts.map(p => p.v)], 48, 72)
    : buildMesh(state.aspect, rows);
  setGeometry(state.mesh.geo);
}

// ---- Phase 13: custom parts ----
function removePart(part) {
  state.parts = state.parts.filter(p => p.id !== part.id);
  removeCustomSlider($('sliders'), part.id);
  state.anchors.bulges = buildBulges();
  save();
  refresh();
}
const parts = initParts({
  stage: $('stage'), svg: $('partsvg'), addBtn: $('add-part'), form: $('part-form'),
  nameInput: $('part-name'), okBtn: $('part-ok'), cancelBtn: $('part-cancel'), help: $('part-help'),
  onMode: refresh,
  onAdd(part) {
    state.anchors.bulges = buildBulges();
    addCustomSlider($('sliders'), part, removePart);
    buildGrid(); // a finer grid if the picture had none
    refresh();
  }
});

// ---- Phase 14: realism tools ----
const brush = initBrush({
  stage: $('stage'), view: $('maskview'), toggle: $('brush-toggle'), opts: $('brush-opts'), size: $('brush-size'),
  erase: $('brush-erase'), clear: $('brush-clear'), show: $('frozen-show'),
  onChange(mask) { state.mask = mask; syncAnchors(); refresh(); },
  onMode: refresh
});
$('add-part').addEventListener('click', () => brush.stop());                 // one tool at a time
$('brush-toggle').addEventListener('click', () => { if (state.painting) parts.cancel(); });
$('creative').addEventListener('change', e => {
  state.mode = e.target.checked ? 'creative' : 'realistic';
  const pulled = applyRanges($('sliders'), e.target.checked);
  if (pulled) { toast('Some sliders were pulled back into the Realistic range.'); save(); }
  refresh();
});
$('sym').addEventListener('change', e => {
  state.sym = e.target.checked;
  setSplit($('sliders'), !state.sym);
  syncAnchors();
  save();
  refresh();
});
$('link').addEventListener('input', e => {
  state.link = +e.target.value;
  $('link-out').textContent = state.link + '%';
  syncAnchors();
  refresh();
});
$('guides-on').addEventListener('change', e => { state.guides = e.target.checked; refresh(); });
$('meter-on').addEventListener('change', e => { state.meter = e.target.checked; refresh(); });

// ---- Marking points and loading pictures ----
const redrawDots = initLandmarks({
  stage: $('stage'), dots: $('dots'), help: $('mark-help'),
  undo: $('undo'), reset: $('reset-pts'), done: $('done'),
  mirror: $('mirror'), guess: $('guess'), onChange: overlays.redraw,
  onDone() {
    state.anchors = getAnchors(state.points);
    state.anchors.chains = buildChains(); // Phase 11: the arm and leg bones that have all their joint points
    state.anchors.neck = neckBase();      // Phase 12: null unless both neck points are placed
    state.anchors.bulges = buildBulges(); // Phase 13: chest and custom parts
    const chest = ['L', 'R'].map(sd => state.ext[slot(sd, J.CH)]).filter(Boolean);
    state.anchors.chestV = chest.length ? chest.reduce((a, p) => a + p.v, 0) / chest.length : null; // for the chest to upper torso link
    syncAnchors();
    buildGrid();
    updateLocks($('sliders'));
    setScreen('shape');
  }
});

setupUpload($('file'), $('drop'), $('err'), canvas => {
  state.img = canvas;
  state.aspect = canvas.width / canvas.height;
  state.points = [];
  state.ext = newExt();
  state.reach = {};
  parts.cancel();
  brush.reset(state.aspect);
  state.mask = null;
  state.parts = [];
  clearCustomSliders($('sliders'));
  state.anchors = null;
  state.compare = false;
  setSliderValues($('sliders'), {});
  resetHistory();
  state.mesh = buildMesh(state.aspect);
  setPicture(canvas, state.aspect, state.mesh.geo);
  redrawDots();
  setScreen('mark');
}, busy);

$('show-bones').addEventListener('change', e => document.body.classList.toggle('hide-bones', !e.target.checked));
$('grid').addEventListener('change', e => { state.grid = e.target.checked; refresh(); });
$('back').addEventListener('click', () => {
  parts.cancel(); // leave "add custom part" and brush modes if they are on
  brush.stop();
  flatten(state.mesh, state.aspect);
  setScreen('mark');
});

// ---- Phase 9: tutorial ----
initTutorial($('tut'), $('help'));
