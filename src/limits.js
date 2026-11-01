// Phase 14: safe ranges, linked parts, and the proportion hints.
import { state } from './state.js';
import { slot, J } from './bones.js';

// [Realistic, Creative] = the biggest change a slider can make, as a fraction. 0.2 = plus or minus 20%.
// A slider's -100..+100 always means the Creative range; Realistic simply stops the slider earlier.
// These are starting points. Test them on your own pictures and change them here.
export const LIMITS = {
  head: [0.20, 0.50],
  neckLen: [0.35, 0.70], neckThick: [0.25, 0.50],
  shoulder: [0.20, 0.45],
  chestSize: [0.30, 0.60], chestLift: [0.30, 0.60],
  waist: [0.25, 0.50], hip: [0.25, 0.50],
  torso: [0.15, 0.35], leg: [0.15, 0.35], height: [0.15, 0.35],
  uarmLen: [0.15, 0.35], farmLen: [0.15, 0.35], uarmThick: [0.30, 0.60], farmThick: [0.30, 0.60], handSize: [0.10, 0.30],
  thighLen: [0.15, 0.35], calfLen: [0.15, 0.35], thigh: [0.30, 0.60], calf: [0.25, 0.50], footSize: [0.10, 0.30]
};
const CUSTOM_PART = [0.30, 0.60];
const baseOf = key => key.split(':')[0]; // 'shoulder:L' -> 'shoulder'

export function limitOf(key) {
  const k = baseOf(key);
  return LIMITS[k] || (k.startsWith('part_') ? CUSTOM_PART : [0.25, 0.50]);
}
export const maxChange = key => limitOf(key)[1];
// The end of the slider in slider units (100 = the Creative end).
export const sliderMax = (key, creative) => (creative ? 100 : Math.round((limitOf(key)[0] / limitOf(key)[1]) * 100));

// Linked parts: when `from` changes, `to` also changes by k times that amount (scaled by Link strength).
// Shoulder width to arm start, neck length to head position and arm length to hand position are automatic already
// (the joints follow the body-wide warp), so they are not listed here.
export const LINKS = [
  { from: 'hip', to: 'thigh', k: 0.3 },   // wider hips thicken the upper thighs
  { from: 'thigh', to: 'hip', k: 0.2 }    // thicker thighs widen the hips a little
];
export const CHEST_TORSO = 0.1; // chest size also widens the upper torso by 10% of its change

// ---------- Proportion helper ----------

// Heights of the key points (in picture units, 0 = top). sample(u, v) tells where a point is after the warp.
export function heights(sample) {
  const P = state.points, at = p => sample(p.u, p.v);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const both = k => ['L', 'R'].map(s => state.ext[slot(s, k)]).filter(Boolean).map(at);
  const n = state.ext;
  return {
    top: at(P[0]), chin: at(P[1]), crotch: at(P[8]), knee: at(P[9]), feet: at(P[10]),
    waist: mean([4, 5].map(i => at(P[i]))), hip: mean([6, 7].map(i => at(P[i]))),
    wrist: mean(both(J.WR)), tip: mean(both(J.HT)),
    neck: n[0] && n[1] ? sample((n[0].u + n[1].u) / 2, (n[0].v + n[1].v) / 2) : null
  };
}

function metrics(h) {
  const total = h.feet - h.top, head = h.chin - h.top;
  if (total < 0.05 || head < 0.01) return null;
  return {
    heads: total / head,                                                   // about 7.5 for an adult
    crotch: (h.crotch - h.top) / total,                                    // about 0.5
    wrist: h.wrist == null ? null : (h.wrist - h.hip) / total,             // wrists near hip height: about 0
    tip: h.tip == null ? null : (h.tip - (h.crotch + h.knee) / 2) / total, // fingertips near mid-thigh: about 0
    neck: h.neck == null ? null : (h.neck - h.chin) / head                 // neck length compared with the head
  };
}

// [metric, low limit, high limit, message for low, message for high, how much worse than the original it must be]
const RULES = [
  ['heads', 6.2, 8.8, 'The head is now very large for the body.', 'The head is now very small for the body.', 0.3],
  ['crotch', 0.43, 0.57, 'The legs look very long.', 'The legs look very short.', 0.02],
  ['wrist', -0.07, 0.07, 'The arms are now very short.', 'The arms are now very long.', 0.02],
  ['tip', -0.08, 0.08, 'The fingertips end far above mid-thigh.', 'The fingertips reach far below mid-thigh.', 0.02],
  ['neck', null, 0.9, '', 'The neck is very long.', 0.1]
];

// A hint appears only when a slider pushed a proportion out of the usual range AND made it worse than the original
// picture was, so a chibi or stylized character does not get warned about its own style. It is never a block.
export function proportionHints(sampleNow, sampleOrig) {
  const now = metrics(heights(sampleNow)), was = metrics(heights(sampleOrig)), out = [];
  if (!now || !was) return out;
  for (const [k, lo, hi, loMsg, hiMsg, margin] of RULES) {
    if (now[k] == null || was[k] == null) continue;
    if (k === 'tip' && out.some(m => m.startsWith('The arms'))) continue; // already said
    if (lo != null && now[k] < lo && was[k] - now[k] >= margin) out.push(loMsg);
    else if (hi != null && now[k] > hi && now[k] - was[k] >= margin) out.push(hiMsg);
  }
  return out;
}

// ---------- Stretch meter maths ----------

// For every small triangle of the grid, how much did the warp stretch it? Measured as the biggest and the smallest
// change of length in any direction (1 = unchanged, 1.35 = 35% longer, 0.65 = 35% shorter). Plain "area" would call a
// perfectly even +20% head a 44% stretch, so the meter looks at lengths instead. A triangle that turned inside out
// counts as folded. each(i, big, small, det) is called for every triangle (used to paint the overlay).
// Returns { stretched, squeezed, folded, total }: how many triangles went past 35% longer, 35% shorter, or inside out, out of how many.
export function analyzeMesh(mesh, aspect, each) {
  const ia = mesh.geo.index, idx = ia.array || ia, tri = idx.length / 3, pos = mesh.geo.attributes.position.array;
  if (!mesh.inv || mesh.inv.length !== tri * 4 || mesh.invAspect !== aspect) { // inverse of each original triangle, once per grid
    const inv = new Float32Array(tri * 4);
    for (let i = 0; i < tri; i++) {
      const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
      const e1x = (mesh.origU[b] - mesh.origU[a]) * aspect, e1y = mesh.origV[b] - mesh.origV[a];
      const e2x = (mesh.origU[c] - mesh.origU[a]) * aspect, e2y = mesh.origV[c] - mesh.origV[a];
      const det = e1x * e2y - e2x * e1y;
      inv[i * 4] = e2y / det; inv[i * 4 + 1] = -e2x / det; inv[i * 4 + 2] = -e1y / det; inv[i * 4 + 3] = e1x / det;
    }
    mesh.inv = inv;
    mesh.invAspect = aspect;
  }
  const st = { stretched: 0, squeezed: 0, folded: 0, total: tri }, inv = mesh.inv;
  for (let i = 0; i < tri; i++) {
    const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
    const n1x = pos[b * 3] - pos[a * 3], n1y = -(pos[b * 3 + 1] - pos[a * 3 + 1]); // y flipped: the screen goes up, the picture goes down
    const n2x = pos[c * 3] - pos[a * 3], n2y = -(pos[c * 3 + 1] - pos[a * 3 + 1]);
    const j00 = n1x * inv[i * 4] + n2x * inv[i * 4 + 2], j01 = n1x * inv[i * 4 + 1] + n2x * inv[i * 4 + 3];
    const j10 = n1y * inv[i * 4] + n2y * inv[i * 4 + 2], j11 = n1y * inv[i * 4 + 1] + n2y * inv[i * 4 + 3];
    const det = j00 * j11 - j01 * j10, S = j00 * j00 + j01 * j01 + j10 * j10 + j11 * j11;
    const r = Math.sqrt(Math.max(0, S * S - 4 * det * det)), big = Math.sqrt((S + r) / 2), small = Math.sqrt(Math.max(0, (S - r) / 2));
    if (det <= 0.02) st.folded++;
    else if (big > 1.35) st.stretched++;
    else if (small < 0.65) st.squeezed++;
    if (each) each(i, big, small, det);
  }
  return st;
}
