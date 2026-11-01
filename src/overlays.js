// Phase 10: draws the bones and capsules on the picture (marking screen only) and lets the user
// drag the edge of a capsule to make it wider or thinner.
import { state } from './state.js';
import { FAMILIES, slot, reachOf, J } from './bones.js';
import { analyzeMesh } from './limits.js';

const MIN_C = 0.01, MAX_C = 0.3; // chest circle radius limits

const NS = 'http://www.w3.org/2000/svg';
const MIN_R = 0.004, MAX_R = 0.2; // capsule radius limits, as a fraction of the picture height

export function initOverlays(stage, svg, guidesSvg, meterCanvas) {
  const el = (name, attrs) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  };

  function redraw() {
    const r = stage.getBoundingClientRect(), W = r.width, H = r.height;
    svg.textContent = '';
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const handleR = matchMedia('(pointer:coarse)').matches ? 15 : 8;
    const px = p => [p.u * W, p.v * H];
    const handles = [], chests = [];

    for (const side of ['L', 'R']) {
      const e = k => state.ext[slot(side, k)];
      // thin helper lines: wrist to hand tip, ankle to foot tip
      for (const [a, b] of [[J.WR, J.HT], [J.AN, J.FT]]) {
        if (!e(a) || !e(b)) continue;
        const [x1, y1] = px(e(a)), [x2, y2] = px(e(b));
        el('line', { x1, y1, x2, y2, class: 'bone thin' });
      }
      if (e(J.CH)) { // chest circle (the chest bulge reaches this far)
        const [cx, cy] = px(e(J.CH)), rr = reachOf('chest', side) * H;
        const circ = el('circle', { cx, cy, r: rr, class: 'chest' });
        chests.push({ side, cx, cy, circ });
      }
      for (const f of FAMILIES) {
        if (f.neck || f.chest || !e(f.from) || !e(f.to)) continue;
        const [ax, ay] = px(e(f.from)), [bx, by] = px(e(f.to)), len = Math.hypot(bx - ax, by - ay);
        if (len < 2) continue;
        const R = reachOf(f.id, side) * H;
        const cap = el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'cap ' + (f.zone ? 'rigid' : f.limb), 'stroke-width': 2 * R });
        el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: 'bone' });
        handles.push({ id: f.id, side, ax, ay, bx, by, len, cap });
      }
    }
    if (state.ext[0] && state.ext[1]) { // neck: the line across its base, and the axis up to the chin
      const [x1, y1] = px(state.ext[0]), [x2, y2] = px(state.ext[1]);
      el('line', { x1, y1, x2, y2, class: 'bone thin' });
      if (state.points[1]) {
        const [cx, cy] = px(state.points[1]);
        el('line', { x1: (x1 + x2) / 2, y1: (y1 + y2) / 2, x2: cx, y2: cy, class: 'bone thin' });
      }
    }

    // handles last, so they sit on top
    for (const c of chests) {
      const dot = el('circle', { cx: c.cx + reachOf('chest', c.side) * H, cy: c.cy, r: handleR, class: 'handle' });
      dot.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); dot.setPointerCapture(e.pointerId); dot.dataset.drag = '1'; });
      dot.addEventListener('pointermove', e => {
        if (!dot.dataset.drag) return;
        const b = stage.getBoundingClientRect();
        const rr = Math.min(MAX_C, Math.max(MIN_C, Math.hypot(e.clientX - b.left - c.cx, e.clientY - b.top - c.cy) / H));
        state.reach['chest' + c.side] = rr;
        c.circ.setAttribute('r', rr * H);
        dot.setAttribute('cx', c.cx + rr * H);
        dot.setAttribute('cy', c.cy);
      });
      const end = () => { delete dot.dataset.drag; };
      dot.addEventListener('pointerup', end);
      dot.addEventListener('pointercancel', end);
    }
    for (const h of handles) {
      const nx = -(h.by - h.ay) / h.len, ny = (h.bx - h.ax) / h.len, mx = (h.ax + h.bx) / 2, my = (h.ay + h.by) / 2;
      const R = reachOf(h.id, h.side) * H;
      const dot = el('circle', { cx: mx + nx * R, cy: my + ny * R, r: handleR, class: 'handle' });
      dot.addEventListener('pointerdown', e => {
        e.stopPropagation(); // do not place a landmark under the handle
        e.preventDefault();
        dot.setPointerCapture(e.pointerId);
        dot.dataset.drag = '1';
      });
      dot.addEventListener('pointermove', e => {
        if (!dot.dataset.drag) return;
        const b = stage.getBoundingClientRect();
        const dist = Math.abs((e.clientX - b.left - mx) * nx + (e.clientY - b.top - my) * ny); // distance from the bone line
        const rr = Math.min(MAX_R, Math.max(MIN_R, dist / H));
        state.reach[h.id + h.side] = rr;
        h.cap.setAttribute('stroke-width', 2 * rr * H);
        dot.setAttribute('cx', mx + nx * rr * H);
        dot.setAttribute('cy', my + ny * rr * H);
      });
      const end = () => { delete dot.dataset.drag; };
      dot.addEventListener('pointerup', end);
      dot.addEventListener('pointercancel', end);
    }
  }

  // ---------- Phase 14: proportion guides and the stretch meter (shape screen) ----------

  // Where a point (x, y in screen units, before 'fit') lands inside the stage, in pixels.
  const toPx = (x, y, fit, W, H) => [((x * fit + state.aspect / 2) / state.aspect) * W, (0.5 - y * fit) * H];
  const vToPx = (v, fit, H) => (0.5 - (0.5 - v) * fit) * H; // a height in picture units (0 = top) to a pixel row

  // Soft guide lines from common drawing guidelines. h = heights() from limits.js, measured after the warp.
  function drawGuides(h, fit) {
    const b = stage.getBoundingClientRect(), W = b.width, H = b.height;
    guidesSvg.textContent = '';
    if (!h || !W) return;
    guidesSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const line = (v, label, cls) => {
      const y = vToPx(v, fit, H);
      const l = document.createElementNS(NS, 'line');
      for (const [k, val] of Object.entries({ x1: 0, x2: W, y1: y, y2: y, class: 'gl ' + cls })) l.setAttribute(k, val);
      const t = document.createElementNS(NS, 'text');
      for (const [k, val] of Object.entries({ x: 6, y: y - 4, class: 'gt' })) t.setAttribute(k, val);
      t.textContent = label;
      guidesSvg.append(l, t);
    };
    const head = h.chin - h.top;
    for (let k = 1; k <= 7; k++) if (h.top + k * head < h.feet + head * 0.3) line(h.top + k * head, k + ' head' + (k > 1 ? 's' : ''), 'head');
    line((h.top + h.feet) / 2, 'half height (crotch)', 'key');
    line(h.waist, 'waist / elbows', 'key');
    line(h.hip, 'hips / wrists', 'key');
    line((h.crotch + h.knee) / 2, 'mid-thigh / fingertips', 'key');
  }

  // Blue where the picture is squeezed, red where it is stretched (see analyzeMesh in limits.js).
  // Returns { stretched, squeezed, folded }. Paints the overlay only when draw is true.
  function stretchMeter(mesh, fit, draw) {
    const W = stage.clientWidth, H = stage.clientHeight, ctx = draw ? meterCanvas.getContext('2d') : null;
    let red, blue, idx, pos;
    if (ctx) {
      if (meterCanvas.width !== W || meterCanvas.height !== H) { meterCanvas.width = W; meterCanvas.height = H; }
      ctx.clearRect(0, 0, W, H);
      red = Array.from({ length: 5 }, () => new Path2D());
      blue = Array.from({ length: 5 }, () => new Path2D());
      idx = mesh.geo.index.array || mesh.geo.index;
      pos = mesh.geo.attributes.position.array;
    }
    const stats = analyzeMesh(mesh, state.aspect, ctx && ((i, big, small) => {
      const grow = big > 1.1, shrink = small < 0.9;
      if (!grow && !shrink) return; // only paint where something really changed
      const q = Math.min(4, Math.floor(((grow ? big - 1 : 1 - small) / 0.5) * 5)), path = (grow ? red : blue)[q];
      for (let k = 0; k < 3; k++) {
        const v = idx[i * 3 + k], [px, py] = toPx(pos[v * 3], pos[v * 3 + 1], fit, W, H);
        if (k === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      path.closePath();
    }));
    if (ctx) for (let q = 0; q < 5; q++) {
      ctx.fillStyle = `rgba(235,40,40,${0.2 + q * 0.14})`; ctx.fill(red[q]);
      ctx.fillStyle = `rgba(40,100,240,${0.2 + q * 0.14})`; ctx.fill(blue[q]);
    }
    return stats;
  }
  const clearShape = () => {
    guidesSvg.textContent = '';
    if (meterCanvas.width) meterCanvas.getContext('2d').clearRect(0, 0, meterCanvas.width, meterCanvas.height);
  };
  return { redraw, drawGuides, stretchMeter, clearShape };
}
