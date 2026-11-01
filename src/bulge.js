// Phase 13: the bulge. A soft push (or pull) around one center, like a magnifying glass that fades out smoothly.
// Used for the chest and for custom parts (belly, biceps, cheeks, a tail...).
import { state } from './state.js';
import { slot, J, reachOf, lockReason } from './bones.js';

const smoothstep = t => t * t * (3 - 2 * t);

// p = the dot, C = the center, R = the radius (all in picture units).
// amount: 0.2 = 20% bigger in the middle, negative pulls in. lift: moves the middle up (positive) or down; same soft edge.
// Returns the new { x, y }. Outside the circle the dot does not move at all, so there is no hard edge.
export function bulge(p, C, R, amount, lift = 0) {
  const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy) / R;
  if (d >= 1) return p;
  const falloff = 1 - smoothstep(d);  // 1 at the center, 0 at the edge
  const k = 1 + amount * falloff;
  return { x: C.x + dx * k, y: C.y + dy * k - lift * falloff };
}

// All bulges for the current picture, in picture units (x = u * aspect, y = v). Call when the user presses Done,
// and again when a custom part is added or removed.
export function buildBulges() {
  const list = [], asp = state.aspect;
  if (!lockReason('chest')) {
    for (const side of ['L', 'R']) {
      const c = state.ext[slot(side, J.CH)];
      // avoidArms: the chest bulge is weaker next to the arm bones, so it never drags the arm
      list.push({ id: 'chest' + side, side, C: { x: c.u * asp, y: c.v }, R: reachOf('chest', side), sizeKey: 'chestSize', liftKey: 'chestLift', avoidArms: true });
    }
  }
  for (const part of state.parts) {
    list.push({ id: part.id, C: { x: part.u * asp, y: part.v }, R: part.r, sizeKey: 'part_' + part.id, liftKey: null, avoidArms: false });
  }
  return list;
}
