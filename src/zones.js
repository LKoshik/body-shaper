// Phase 14: the protect brush. The user paints over an area to mark it "do not change" (a held weapon, a logo).
// The mask is a small hidden canvas, 256 pixels on the long side, in ORIGINAL picture coordinates.
// Each grid dot reads the mask at its original position; the value (0 to 1) says how much of the warp to cancel.
import { state } from './state.js';

const LONG = 256;

export function initBrush({ stage, view, toggle, opts, size, erase, clear, show, onChange, onMode }) {
  const ctx = view.getContext('2d', { willReadFrequently: true });
  let last = null, has = false;

  const syncView = () => { view.hidden = !show.checked || !(has || state.painting); };

  function reset(aspect) { // new picture: empty mask, canvas in the picture's shape
    view.width = Math.max(8, Math.round(aspect >= 1 ? LONG : LONG * aspect));
    view.height = Math.max(8, Math.round(aspect >= 1 ? LONG / aspect : LONG));
    has = false;
    stop();
  }
  function stop() { // leave painting mode
    if (!state.painting) { syncView(); return; }
    state.painting = false;
    last = null;
    opts.hidden = true;
    toggle.textContent = 'Protect brush';
    document.body.classList.remove('painting');
    syncView();
    onMode();
  }

  const at = e => {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.width, y: ((e.clientY - r.top) / r.height) * view.height };
  };
  function stamp(x, y) { // one soft round dab
    const r = +size.value, g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70,120,255,.6)');
    g.addColorStop(0.5, 'rgba(70,120,255,.4)');
    g.addColorStop(1, 'rgba(70,120,255,0)'); // soft edge: the picture blends into the moving area
    ctx.globalCompositeOperation = erase.checked ? 'destination-out' : 'source-over';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function stroke(p) {
    const step = Math.max(1, +size.value / 4), dx = p.x - last.x, dy = p.y - last.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
    for (let i = 1; i <= n; i++) stamp(last.x + (dx * i) / n, last.y + (dy * i) / n);
    last = p;
  }
  function finish() { // read the mask back and tell the warp
    const w = view.width, h = view.height, d = ctx.getImageData(0, 0, w, h).data, a = new Uint8ClampedArray(w * h);
    has = false;
    for (let i = 0; i < a.length; i++) { a[i] = d[i * 4 + 3]; if (a[i] > 2) has = true; }
    syncView();
    onChange(has ? { w, h, data: a } : null);
  }

  stage.addEventListener('pointerdown', e => {
    if (!state.painting) return;
    stage.setPointerCapture(e.pointerId);
    last = at(e);
    stamp(last.x, last.y);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => { if (state.painting && last) stroke(at(e)); });
  const up = () => { if (state.painting && last) { last = null; finish(); } };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  toggle.addEventListener('click', () => {
    if (document.body.dataset.screen !== 'shape') return;
    if (state.painting) { stop(); return; }
    state.painting = true;
    opts.hidden = false;
    toggle.textContent = 'Done painting';
    document.body.classList.add('painting');
    syncView();
    onMode();
  });
  clear.addEventListener('click', () => {
    ctx.clearRect(0, 0, view.width, view.height);
    finish();
  });
  show.addEventListener('change', syncView);
  return { reset, stop };
}
