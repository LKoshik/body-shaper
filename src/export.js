// Phase 8: make a PNG of the edited picture.
import { state } from './state.js';
import { applyWarp } from './warp.js';
import { renderPNG } from './renderer.js';

// [width, height] of the PNG. Full = the working picture size. Preview = 1024 on the long side.
export function exportSize(full) {
  const w = state.img.width, h = state.img.height;
  const k = full ? 1 : Math.min(1, 1024 / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}

// bg: null = transparent, or a color like '#ffffff'
export function makePNG({ full, bg }) {
  const fit = applyWarp(state.mesh, state.anchors, state.values, state.aspect); // same warp as the screen
  const [w, h] = exportSize(full);
  return renderPNG(state.mesh.geo, state.img, state.aspect, fit, w, h, bg);
}

export function download(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'body-shaper.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
