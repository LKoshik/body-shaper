// Phases 10 and 11: joints, bones, capsules, and the bone warp.
// All maths here is in "picture units": x = u * aspect, y = v. One unit is the picture height,
// so angles and distances are true (a circle stays a circle).
import { state } from './state.js';

// The 9 joint points of one side. The slot of a point inside state.ext is slot(side, J.xx).
// state.ext: 0 = neck left, 1 = neck right, 2..10 = left side, 11..19 = right side.
export const J = { SJ: 0, EL: 1, WR: 2, HT: 3, CH: 4, HJ: 5, KN: 6, AN: 7, FT: 8 };
export const JOINT_NAMES = ['shoulder joint', 'elbow', 'wrist', 'hand tip', 'chest center', 'hip joint', 'knee', 'ankle', 'foot tip'];
export const slot = (side, k) => (side === 'L' ? 2 : 11) + k;

const clamp01 = x => Math.min(1, Math.max(0, x));
const smoothstep = t => t * t * (3 - 2 * t);
const pt = p => ({ x: p.u * state.aspect, y: p.v });
const centerU = () => [2, 3, 4, 5, 6, 7].reduce((s, i) => s + state.points[i].u, 0) / 6;

// ---------- Phase 10: helpers for placing points ----------

// Copies points from one side to the other across the center line. Returns the slots it filled.
export function mirrorAssist() {
  const cx = centerU(), e = state.ext, done = [];
  const pairs = [[0, 1]];
  for (let k = 0; k < 9; k++) pairs.push([slot('L', k), slot('R', k)]);
  for (const [l, r] of pairs) {
    const from = e[l] && !e[r] ? l : e[r] && !e[l] ? r : -1;
    if (from < 0) continue;
    const to = from === l ? r : l, p = e[from];
    e[to] = { u: Math.min(1, Math.max(0, 2 * cx - p.u)), v: p.v };
    if (p.g) e[to].g = true;
    done.push(to);
  }
  return done;
}

// Puts a first guess on every missing point it can work out. The user drags the ones that are off.
// Guessed points are marked g:true so they never overwrite the user's own clicks.
export function smartGuesses() {
  const P = state.points, e = state.ext, cx = centerU(), done = [];
  const put = (i, u, v) => {
    if (e[i]) return;
    e[i] = { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)), g: true };
    done.push(i);
  };
  const chin = P[1].v, top = P[0].v, feet = P[10].v, crotch = P[8].v;
  const shV = (P[2].v + P[3].v) / 2, waV = (P[4].v + P[5].v) / 2;

  const nh = 0.3 * Math.abs(P[3].u - P[2].u) / 2, nv = chin + 0.75 * (shV - chin); // neck
  put(0, cx - nh, nv);
  put(1, cx + nh, nv);

  for (const s of ['L', 'R']) {
    const sh = P[s === 'L' ? 2 : 3], hip = P[s === 'L' ? 6 : 7], at = k => e[slot(s, k)];
    put(slot(s, J.SJ), sh.u + 0.18 * (cx - sh.u), sh.v + 0.015);
    put(slot(s, J.CH), cx + 0.45 * (sh.u - cx), shV + 0.3 * (waV - shV));
    put(slot(s, J.HJ), hip.u + 0.15 * (cx - hip.u), hip.v + 0.4 * (crotch - hip.v));
    const legU = (at(J.KN) || at(J.HJ)).u;
    put(slot(s, J.AN), legU, feet - 0.035 * (feet - top));
    put(slot(s, J.KN), (at(J.HJ).u + at(J.AN).u) / 2, (at(J.HJ).v + at(J.AN).v) / 2);
    put(slot(s, J.FT), at(J.AN).u, feet);
    if (at(J.SJ) && at(J.WR)) put(slot(s, J.EL), (at(J.SJ).u + at(J.WR).u) / 2, (at(J.SJ).v + at(J.WR).v) / 2);
  }
  return done;
}

// When both knees are clicked by the user, the single knee point (#10) takes their average height.
export function syncKnee() {
  const l = state.ext[slot('L', J.KN)], r = state.ext[slot('R', J.KN)], k = state.points[9];
  if (l && r && !l.g && !r.g && k) state.points[9] = { u: k.u, v: (l.v + r.v) / 2 };
}

// ---------- Phase 10: which bones exist, and which sliders are locked ----------

// A bone family = the same bone on the left and the right side.
// needs = joints that must be placed on BOTH sides (a forearm also needs the shoulder, so the chain is complete).
export const FAMILIES = [
  { id: 'uarm',  limb: 'arm', needs: [J.SJ, J.EL],       from: J.SJ, to: J.EL, lenKey: 'uarmLen',  thickKey: 'uarmThick' },
  { id: 'farm',  limb: 'arm', needs: [J.SJ, J.EL, J.WR], from: J.EL, to: J.WR, lenKey: 'farmLen',  thickKey: 'farmThick' },
  { id: 'thigh', limb: 'leg', needs: [J.HJ, J.KN],       from: J.HJ, to: J.KN, lenKey: 'thighLen', thickKey: 'thigh' },
  { id: 'calf',  limb: 'leg', needs: [J.HJ, J.KN, J.AN], from: J.KN, to: J.AN, lenKey: 'calfLen',  thickKey: 'calf' },
  // Phase 12: rigid zones. Hand = wrist to hand tip, riding on the forearm. Foot = ankle to foot tip, riding on the calf.
  { id: 'hand', zone: true, limb: 'arm', parent: 'farm', needs: [J.SJ, J.EL, J.WR, J.HT], from: J.WR, to: J.HT, sizeKey: 'handSize' },
  { id: 'foot', zone: true, limb: 'leg', parent: 'calf', needs: [J.HJ, J.KN, J.AN, J.FT], from: J.AN, to: J.FT, sizeKey: 'footSize' },
  // Phase 12: the neck uses the two neck points (slots 0 and 1) instead of left / right joints.
  { id: 'neck', neck: true },
  // Phase 13: the chest bulge needs the chest center point on both sides.
  { id: 'chest', chest: true, needs: [J.CH] }
];
const SIDES = ['L', 'R'];
const MIN_BONE = 0.01; // shorter than 1% of the picture height = the two points are on top of each other

// Empty string = the slider is free. Otherwise the reason it is locked.
export function lockReason(id) {
  const f = FAMILIES.find(x => x.id === id), miss = [];
  if (f.neck) {
    if (!state.ext[0]) miss.push('neck left');
    if (!state.ext[1]) miss.push('neck right');
    if (miss.length) return 'Needs: ' + miss.join(', ') + '.';
    if (!neckBase()) return 'The neck points must be below the chin and apart from each other.';
    return '';
  }
  for (const s of SIDES) for (const k of f.needs) if (!state.ext[slot(s, k)]) miss.push((s === 'L' ? 'left ' : 'right ') + JOINT_NAMES[k]);
  if (miss.length) return 'Needs: ' + miss.join(', ') + '.';
  for (const s of SIDES) for (let i = 0; i < f.needs.length - 1; i++) {
    const a = pt(state.ext[slot(s, f.needs[i])]), b = pt(state.ext[slot(s, f.needs[i + 1])]);
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_BONE) return 'Two joint points are too close together.';
  }
  return '';
}

// Capsule size. Default is a guess from the shoulder and hip width; the user can drag it.
export function defaultReach(id, side) {
  if (id === 'hand' || id === 'foot') { // rigid zones: a guess from the hand / foot length and the limb they sit on
    const f = FAMILIES.find(x => x.id === id), a = pt(state.ext[slot(side, f.from)]), b = pt(state.ext[slot(side, f.to)]);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.max(0.006, id === 'hand' ? Math.max(0.35 * len, 1.4 * defaultReach('farm')) : Math.max(0.6 * len, 1.3 * defaultReach('calf')));
  }
  const p = state.points, sw = Math.abs(p[3].u - p[2].u) * state.aspect, hw = Math.abs(p[7].u - p[6].u) * state.aspect;
  return Math.max(0.006, { uarm: 0.11 * sw, farm: 0.085 * sw, thigh: 0.24 * hw, calf: 0.16 * hw, chest: sw / 3 }[id]);
}
export const reachOf = (id, side) => state.reach[id + side] ?? defaultReach(id, side);

// ---------- Phase 11: the bone warp ----------

function makeBone(f, side) {
  const a = pt(state.ext[slot(side, f.from)]), b = pt(state.ext[slot(side, f.to)]);
  const len = Math.hypot(b.x - a.x, b.y - a.y), dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const R = reachOf(f.id, side);
  return {
    id: f.id, limb: f.limb, side, cid: f.limb + side, // cid: which chain (left arm, right leg, ...) the bone belongs to
 a, b, len, dir, nrm: { x: -dir.y, y: dir.x }, R,
    tail: 0,               // for the last bone of a chain: how far past the wrist / ankle it still reaches (hand, foot)
    lenKey: f.lenKey, thickKey: f.thickKey,
    root: false, end: false  // first / last bone of its chain
  };
}

// Builds one chain per arm and per leg, from the points placed now. Call it when the user presses Done.
export function buildChains() {
  const open = FAMILIES.filter(f => f.lenKey && !lockReason(f.id)); // bones only
  const chains = [];
  for (const limb of ['arm', 'leg']) for (const side of SIDES) {
    const bones = open.filter(f => f.limb === limb).map(f => makeBone(f, side));
    if (!bones.length) continue;
    bones[0].root = true;
    const last = bones[bones.length - 1];
    last.end = true;
    last.tail = (limb === 'arm' ? 5.5 : 2.5) * last.R;
    const zones = FAMILIES.filter(f => f.zone && f.limb === limb && !lockReason(f.id)).map(f => makeZone(f, side, last));
    chains.push({ limb, side, bones, zones });
  }
  return chains;
}

// A rigid zone (hand or foot) is a capsule from the joint to the tip. Inside it, dots move with the parent bone's
// end joint and keep their shape. Only the size slider can scale it, evenly in both directions.
function makeZone(f, side, parent) {
  const a = pt(state.ext[slot(side, f.from)]), b = pt(state.ext[slot(side, f.to)]);
  const len = Math.hypot(b.x - a.x, b.y - a.y), R = reachOf(f.id, side);
  return {
    id: f.id, side, parent, a, b, len, R,
    dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
    fade: 0.6 * len + 0.5 * R, // wide enough to carry the neighbours when the zone grows
    sizeKey: f.sizeKey, k: 1, cos: 1, sin: 0
  };
}

// The neck: its base is halfway between the two neck points. The neck runs from there up to the chin.
// Returns null if the points are missing or in a bad place.
export function neckBase() {
  const l = state.ext[0], r = state.ext[1], chin = state.points[1];
  if (!l || !r || !chin) return null;
  const v = (l.v + r.v) / 2, hw = Math.abs(r.u - l.u) / 2 * state.aspect;
  if (v - chin.v < 0.01 || hw < 0.005) return null;
  return { u: (l.u + r.u) / 2, v, hw }; // u, v: picture coordinates. hw: half neck width in picture units
}

// Step 2 of the order of operations: where the joints go after the sliders.
// rootNew = where the body-wide warp sent the first joint (so wider shoulders carry the arms outward).
// The bone directions stay as in the picture, so the pose does not change. Only the lengths do.
//   vf(bone)     = vertical stretch the body-wide sliders give this bone
//   lenOf(bone)  = the bone's own length slider as a scale
//   thickOf(bone)= the bone's own thickness slider as a scale
//   sizeOf(zone) = the hand / foot size slider as a scale
export function poseChain(chain, rootNew, vf, lenOf, thickOf, sizeOf) {
  let prev = rootNew;
  for (const b of chain.bones) {
    const s = lenOf(b), f = vf(b);
    const vx = (b.b.x - b.a.x) * s, vy = (b.b.y - b.a.y) * s * f;
    const l2 = Math.hypot(vx, vy);
    b.a2 = prev;
    b.b2 = { x: prev.x + vx, y: prev.y + vy };
    b.len2 = l2;
    b.dir2 = l2 > 1e-9 ? { x: vx / l2, y: vy / l2 } : b.dir;
    b.nrm2 = { x: -b.dir2.y, y: b.dir2.x };
    b.th = thickOf(b);
    prev = b.b2;
  }
  // rigid zones turn the same way as the bone they ride on
  for (const z of chain.zones || []) {
    const p = z.parent;
    z.cos = p.dir.x * p.dir2.x + p.dir.y * p.dir2.y;
    z.sin = p.dir.x * p.dir2.y - p.dir.y * p.dir2.x;
    z.k = sizeOf(z);
  }
}

// t = how far along the bone (0 at the start joint, 1 at the end joint). side = distance to the side.
export function toBoneSpace(b, x, y) {
  const rx = x - b.a.x, ry = y - b.a.y;
  return { t: (rx * b.dir.x + ry * b.dir.y) / b.len, side: rx * b.nrm.x + ry * b.nrm.y };
}

// Thickness is eased in at the shoulder / hip, and eased out past the wrist / ankle.
function thickAt(b, t) {
  let k = 1;
  if (b.root) k *= smoothstep(clamp01(t / 0.3));
  if (b.end) k *= 1 - smoothstep(clamp01(((t - 1) * b.len) / (1.5 * b.R)));
  return 1 + (b.th - 1) * k;
}

// Back to picture units using the NEW joints. Before the start and after the end the dot is carried
// along rigidly (not stretched), so a longer forearm moves the hand without stretching the fingers.
export function fromBoneSpace(b, t, side) {
  const along = t < 0 ? t * b.len : t > 1 ? b.len2 + (t - 1) * b.len : t * b.len2;
  const k = side * thickAt(b, t);
  return { x: b.a2.x + b.dir2.x * along + b.nrm2.x * k, y: b.a2.y + b.dir2.y * along + b.nrm2.y * k };
}

// 1 inside the capsule, then a smooth fade to 0 outside it. The fade is wide (3 capsule radii + 2% of the
// picture height) on purpose: a narrow fade makes the grid fold over itself where the limb and the body move differently.
// (The blueprint's plain (1 - d/reach)^2 would also let the limb's own edge slip back to the body warp.)
export function boneWeight(b, x, y) {
  const rx = x - b.a.x, ry = y - b.a.y, along = rx * b.dir.x + ry * b.dir.y;
  const t = Math.min(b.len + b.tail, Math.max(0, along));
  const dx = rx - b.dir.x * t, dy = ry - b.dir.y * t, d2 = dx * dx + dy * dy;
  let R = b.R;
  if (b.tail && along > b.len) R *= 1 + 0.4 * smoothstep(clamp01((along - b.len) / (0.6 * b.R))); // hands and feet are wider
  const fade = R * 3 + 0.02, far = R + fade;
  if (d2 >= far * far) return 0;
  const d = Math.sqrt(d2);
  return d <= R ? 1 : 1 - smoothstep((d - R) / fade);
}

// Step 3: moves one dot. (bodyX, bodyY) = where the body-wide warp put it; the weight left over goes to that.
// When a dot is inside one limb's capsule, a stronger limb nearby wins: a hand resting next to a thigh
// stays with the arm. Bones of the same limb (upper arm and forearm at the elbow) simply share the dot.
const W = [];
export function warpDot(bones, zones, x, y, bodyX, bodyY, out) {
  const n = bones.length;
  let any = false;
  for (let j = 0; j < n; j++) { W[j] = boneWeight(bones[j], x, y); if (W[j] > 0) any = true; }
  let sx = 0, sy = 0, total = 0;
  if (any) for (let j = 0; j < n; j++) {
    let w = W[j];
    if (w <= 0) continue;
    for (let i = 0; i < n; i++) {
      if (bones[i].cid === bones[j].cid || W[i] <= w) continue;
      w *= 1 - W[i] * smoothstep(clamp01((W[i] - W[j]) / 0.4));
    }
    if (w <= 0) continue;
    const b = bones[j], s = toBoneSpace(b, x, y), p = fromBoneSpace(b, s.t, s.side);
    sx += p.x * w; sy += p.y * w; total += w;
  }
  if (total > 1) { sx /= total; sy /= total; total = 1; }
  out[0] = sx + bodyX * (1 - total);
  out[1] = sy + bodyY * (1 - total);
  // step 5: rigid zones win over everything else inside their capsule
  for (const z of zones) {
    const w = zoneWeight(z, x, y);
    if (w <= 0) continue;
    const p = moveWithZone(z, x, y);
    out[0] += (p.x - out[0]) * w;
    out[1] += (p.y - out[1]) * w;
  }
}

// 1 inside the zone capsule, smooth fade to 0 outside.
export function zoneWeight(z, x, y) {
  const rx = x - z.a.x, ry = y - z.a.y;
  const t = Math.min(z.len, Math.max(0, rx * z.dir.x + ry * z.dir.y));
  const dx = rx - z.dir.x * t, dy = ry - z.dir.y * t, d = Math.sqrt(dx * dx + dy * dy);
  return d <= z.R ? 1 : d >= z.R + z.fade ? 0 : 1 - smoothstep((d - z.R) / z.fade);
}

// Turn with the parent bone, scale evenly (hand / foot size) around its end joint, then sit on the new joint.
export function moveWithZone(z, x, y) {
  const p = z.parent, rx = x - p.b.x, ry = y - p.b.y;
  return { x: p.b2.x + z.k * (z.cos * rx - z.sin * ry), y: p.b2.y + z.k * (z.sin * rx + z.cos * ry) };
}
