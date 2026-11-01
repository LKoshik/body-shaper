// Turns slider values into moved grid dots. Works in picture coordinates
// (u across, v down, both 0..1), then converts to screen units at the end.
import { warpDot, poseChain, boneWeight } from './bones.js';
import { bulge } from './bulge.js';
import { maxChange, LINKS, CHEST_TORSO } from './limits.js';

const MIN_SCALE = 0.2;   // never squash a section below this (stops folding)
const avg = (a, b) => (a + b) / 2;
const smoothstep = t => t * t * (3 - 2 * t);
const clamp01 = x => Math.min(1, Math.max(0, x));

// Heights and the center line, worked out from the 11 clicked points.
// a = [headTop, chin, shoulders, waist, hips, knee, feet]
export function getAnchors(p) {
  const v = i => p[i].v;
  return {
    a: [v(0), v(1), avg(v(2), v(3)), avg(v(4), v(5)), avg(v(6), v(7)), v(9), v(10)],
    crotch: v(8),
    hw: [[2, 3], [4, 5], [6, 7]].map(([l, r]) => Math.abs(p[r].u - p[l].u) / 2), // half width at shoulders, waist, hips
    cx: [2, 3, 4, 5, 6, 7].reduce((s, i) => s + p[i].u, 0) / 6
  };
}

// The heights must go strictly top to bottom, or the warp would fold.
export function validate(p) {
  const g = getAnchors(p);
  const seq = [...g.a.slice(0, 5), g.crotch, g.a[5], g.a[6]];
  for (let i = 0; i < seq.length - 1; i++) if (seq[i + 1] - seq[i] < 0.005) return false;
  return true;
}

// Length change: a different ruler for each body section.
function remapY(y, a, ls) {
  if (y <= a[0]) return y;
  let n = a[0];
  for (let i = 0; i < a.length - 1; i++) {
    if (y >= a[i + 1]) n += (a[i + 1] - a[i]) * ls[i];
    else return n + (y - a[i]) * ls[i];
  }
  return n + (y - a[a.length - 1]);
}

// Width change: blend smoothly between the scales set at each landmark height.
function widthScaleAt(y, c) {
  if (y <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    const [y0, s0] = c[i], [y1, s1] = c[i + 1];
    if (y <= y1) {
      const k = smoothstep((y - y0) / (y1 - y0));
      return s0 * (1 - k) + s1 * k;
    }
  }
  return c[c.length - 1][1];
}

// How much of a frozen zone's mask (0 to 1) is at one place. mk = { w, h, data } with data = alpha 0..255.
function maskAt(mk, u, v) {
  const fx = Math.min(mk.w - 1, Math.max(0, u * mk.w - 0.5)), fy = Math.min(mk.h - 1, Math.max(0, v * mk.h - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(mk.w - 1, x0 + 1), y1 = Math.min(mk.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0, d = mk.data;
  const top = d[y0 * mk.w + x0] * (1 - tx) + d[y0 * mk.w + x1] * tx, bot = d[y1 * mk.w + x0] * (1 - tx) + d[y1 * mk.w + x1] * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}

// Moves every dot. Returns a fit factor (<1 if the result must shrink to fit the frame).
// Order (blueprint 6.8): 1 body-wide warp, 2 move the joints, 3 bones, 4 bulges, 5 rigid and frozen zones.
// g also carries the Phase 14 settings: g.link (0..1 link strength), g.split (Symmetry lock off), g.mask, g.chestV.
export function applyWarp(m, g, val, aspect) {
  // A slider as a change of size. side = 'L' or 'R' when the Symmetry lock is off and the slider is split.
  const raw = (k, side) => (g.split && side ? val[k + ':' + side] : val[k]) || 0;
  const delta = (k, side) => (raw(k, side) / 100) * maxChange(k);
  const link = g.link ?? 1;
  const s = (k, side) => { // size scale, with the linked parts added in (Link strength)
    let d = delta(k, side);
    if (link > 0) for (const r of LINKS) if (r.to === k) d += link * r.k * delta(r.from, side);
    return Math.max(MIN_SCALE, 1 + d);
  };
  const [top, chin, sh, wa, hi, kn, ft] = g.a;
  const o = s('height'), t = s('torso'), l = s('leg'), hs = s('head');
  const ls = [hs * o, o, t * o, t * o, l * o, l * o].map(x => Math.max(MIN_SCALE, x));
  const chains = g.chains || [], bones = chains.flatMap(c => c.bones), zones = chains.flatMap(c => c.zones || []);
  const hasBone = id => bones.some(b => b.id === id);
  const makeCtl = side => [
    [top, hs], [chin, hs], [avg(chin, sh), 1],
    [sh, s('shoulder', side)], [wa, s('waist', side)], [hi, s('hip', side)],
    // thigh and calf thickness: the bone method takes over when the leg bones exist
    [avg(g.crotch, kn), hasBone('thigh') ? 1 : s('thigh', side)], [avg(kn, ft), hasBone('calf') ? 1 : s('calf', side)], [ft, 1]
  ];
  const ctlL = makeCtl('L'), ctlR = makeCtl('R'); // the same when the Symmetry lock is on

  // Linked part: chest size also widens the upper torso a little (a soft bump between the shoulders and the waist).
  const upper = g.chestV == null ? null : { L: link * CHEST_TORSO * delta('chestSize', 'L'), R: link * CHEST_TORSO * delta('chestSize', 'R') };
  const bump = v => g.chestV == null ? 0 :
    smoothstep(clamp01((v - sh) / Math.max(0.01, g.chestV - sh))) * (1 - smoothstep(clamp01((v - g.chestV) / Math.max(0.01, wa - g.chestV))));

  // Phase 12, neck. Neck length stretches the rows between the chin and the neck base (the head keeps its size,
  // everything below moves down with it). Neck thickness scales sideways around the neck axis, with soft edges.
  const neck = g.neck, nl = s('neckLen'), nt = s('neckThick');
  const nb = neck ? Math.max(chin, Math.min(neck.v, sh - 0.005)) : 0, nspan = Math.max(0.01, nb - chin);
  const yMap = v => remapY(v, g.a, ls) + (neck ? (nl - 1) * o * (Math.min(Math.max(v, chin), nb) - chin) : 0);
  const neckFade = (u, v) => {
    const d = Math.abs(u - neck.u) * aspect, lat = d <= neck.hw ? 1 : 1 - smoothstep(clamp01((d - neck.hw) / (2 * neck.hw)));
    return lat * smoothstep(clamp01((v - chin) / (0.25 * nspan))) * (1 - smoothstep(clamp01((v - nb) / (0.25 * nspan))));
  };

  // Width scale at one dot. With bones, it fades out beside the body, so the background and the limbs
  // (which follow their own bones) are not squeezed against each other. Without bones nothing changes.
  const hwl = [[sh, g.hw[0]], [wa, g.hw[1]], [hi, g.hw[2]]];
  const widthAt = (u, v) => {
    const left = u < g.cx;
    let ws = widthScaleAt(v, left ? ctlL : ctlR);
    if (upper) ws *= 1 + (left ? upper.L : upper.R) * bump(v);
    if (!chains.length) return ws;
    const hw = widthScaleAt(v, hwl);
    return 1 + (ws - 1) * (1 - smoothstep(clamp01((Math.abs(u - g.cx) - hw) / hw)));
  };

  // Phase 11, step 2: the first joint of each limb goes through the body-wide warp, the rest follow the bones.
  // Arms stretch with Overall height only. Legs stretch exactly like the body-wide leg sections.
  const legStretch = b => {
    const dy = b.b.y - b.a.y;
    if (Math.abs(dy) < 0.01) return Math.max(MIN_SCALE, l * o);
    return Math.max(MIN_SCALE, (remapY(b.b.y, g.a, ls) - remapY(b.a.y, g.a, ls)) / dy);
  };
  for (const c of chains) {
    const r = c.bones[0].a;
    poseChain(c,
      { x: (g.cx + (r.x / aspect - g.cx) * widthAt(r.x / aspect, r.y)) * aspect, y: yMap(r.y) },
      b => (b.limb === 'arm' ? o : legStretch(b)),
      b => s(b.lenKey, b.side),
      b => s(b.thickKey, b.side),
      z => s(z.sizeKey, z.side));
  }

  // Steps 1, 3 and 5 for one dot, in picture units: body-wide warp, bones, rigid zones. Result goes into res.
  const tmp = [0, 0];
  const warpOne = (ou, ov, res) => {
    let U = g.cx + (ou - g.cx) * widthAt(ou, ov);
    if (neck && nt !== 1) U += (U - neck.u) * (nt - 1) * neckFade(ou, ov);
    let X = U * aspect, Y = yMap(ov);
    if (bones.length) { warpDot(bones, zones, ou * aspect, ov, X, Y, tmp); X = tmp[0]; Y = tmp[1]; }
    res[0] = X; res[1] = Y;
  };

  // Phase 13, step 4: bulges (chest, custom parts). Each center goes through steps 1 to 5 first, so it follows the body.
  const armBones = bones.filter(b => b.limb === 'arm');
  const bulges = (g.bulges || []).map(bg => {
    const c = [0, 0];
    warpOne(bg.C.x / aspect, bg.C.y, c);
    return { bg, C: { x: c[0], y: c[1] }, amount: s(bg.sizeKey, bg.side) - 1, lift: bg.liftKey ? (s(bg.liftKey, bg.side) - 1) * bg.R : 0 };
  }).filter(b => b.amount !== 0 || b.lift !== 0);

  const mask = g.mask || null;
  const pos = m.geo.attributes.position.array, out = [0, 0];
  let mx = 0, my = 0;
  for (let i = 0; i < m.count; i++) {
    const ou = m.origU[i], ov = m.origV[i];
    warpOne(ou, ov, out);
    let X = out[0], Y = out[1];
    for (const b of bulges) {
      if (Math.abs(X - b.C.x) >= b.bg.R || Math.abs(Y - b.C.y) >= b.bg.R) continue;
      let w = 1; // weaker next to the arm bones
      if (b.bg.avoidArms) { let a = 0; for (const bn of armBones) a = Math.max(a, boneWeight(bn, ou * aspect, ov)); w = 1 - a; }
      if (w <= 0) continue;
      const p = bulge({ x: X, y: Y }, b.C, b.bg.R, b.amount, b.lift);
      X += (p.x - X) * w; Y += (p.y - Y) * w;
    }
    if (mask) { // step 5, frozen zones (protect brush): cancel the warp by the mask value
      const f = maskAt(mask, ou, ov);
      if (f > 0) { X += (ou * aspect - X) * f; Y += (ov - Y) * f; }
    }
    const x = X - aspect / 2, y = 0.5 - Y;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 0;
    mx = Math.max(mx, Math.abs(x)); my = Math.max(my, Math.abs(y));
  }
  m.geo.attributes.position.needsUpdate = true;
  const fit = Math.min(1, aspect / 2 / mx, 0.5 / my);
  return fit > 0.9999 ? 1 : fit;
}
