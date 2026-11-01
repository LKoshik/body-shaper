// The only place that stores data. Every other file reads and writes here.
export const newExt = () => new Array(20).fill(null);

export const state = {
  img: null,      // canvas with the (resized) picture
  aspect: 1,      // width / height of the picture
  points: [],     // landmarks 1 to 11: { u, v } in 0..1 picture coordinates (v goes down)
  ext: newExt(),  // landmarks 12 to 31, null until placed: 0 neck L, 1 neck R, 2..10 left side, 11..19 right side
  parts: [],      // Phase 13: custom parts, { id, name, u, v, r } (r = radius, fraction of picture height)
  adding: false,  // true while the user is placing a custom part
  mask: null,     // Phase 14: the protect brush mask { w, h, data (alpha 0..255) }, or null
  painting: false, // true while the protect brush is on
  mode: 'realistic', // Phase 14: 'realistic' or 'creative' slider ranges
  sym: true,      // Symmetry lock (left = right)
  link: 100,      // Link strength, 0 to 100
  guides: false,  // show the proportion guides
  meter: false,   // show the stretch meter
  reach: {},      // capsule size per bone, like { uarmL: 0.03 } (fraction of picture height). Missing = default
  anchors: null,  // numbers worked out from the points (see warp.js), plus the bone chains
  values: {},     // slider values, -100..100, by key
  mesh: null,     // the grid of dots
  grid: false,    // show the grid lines
  compare: false, // true while "Hold to compare" is pressed
  history: { stack: [{}], index: 0 } // slider snapshots for Undo / Redo
};
