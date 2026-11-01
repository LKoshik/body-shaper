import * as THREE from 'three';

// Builds the rubber sheet: a grid of dots (vertices) over the picture.
// Extra rows are added at the landmark heights so the bends look smooth.
export function buildMesh(aspect, extraV = [], cols = 24, baseRows = 36) {
  const all = [];
  for (let r = 0; r <= baseRows; r++) all.push(r / baseRows);
  for (const v of extraV) all.push(Math.min(1, Math.max(0, v)));
  all.sort((a, b) => a - b);
  const rows = [];
  for (const v of all) if (!rows.length || v - rows[rows.length - 1] > 0.002) rows.push(v);
  rows[rows.length - 1] = 1;

  const nc = cols + 1, n = nc * rows.length;
  const origU = new Float32Array(n), origV = new Float32Array(n), uv = new Float32Array(n * 2);
  rows.forEach((v, r) => {
    for (let c = 0; c < nc; c++) {
      const i = r * nc + c, u = c / cols;
      origU[i] = u; origV[i] = v;
      uv[i * 2] = u; uv[i * 2 + 1] = 1 - v; // texture coordinates never change
    }
  });
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = { geo, origU, origV, count: n, rows, cols };
  flatten(mesh, aspect);
  return mesh;
}

// Put every dot back at its original place (picture looks untouched).
export function flatten(m, aspect) {
  const p = m.geo.attributes.position;
  for (let i = 0; i < m.count; i++) {
    p.array[i * 3] = (m.origU[i] - 0.5) * aspect;
    p.array[i * 3 + 1] = 0.5 - m.origV[i];
    p.array[i * 3 + 2] = 0;
  }
  p.needsUpdate = true;
}

// Where a point of the ORIGINAL picture (u, v) is right now, read from the moved grid. Returns screen units { x, y }.
export function samplePos(m, u, v) {
  const { rows, cols } = m, nc = cols + 1, p = m.geo.attributes.position.array;
  let r = 0;
  while (r < rows.length - 2 && rows[r + 1] <= v) r++;
  const fv = Math.min(1, Math.max(0, (v - rows[r]) / (rows[r + 1] - rows[r])));
  const cu = Math.min(1, Math.max(0, u)) * cols, c = Math.min(cols - 1, Math.floor(cu)), fu = cu - c;
  const at = (rr, cc, k) => p[(rr * nc + cc) * 3 + k];
  const mix = k => (at(r, c, k) * (1 - fu) + at(r, c + 1, k) * fu) * (1 - fv) + (at(r + 1, c, k) * (1 - fu) + at(r + 1, c + 1, k) * fu) * fv;
  return { x: mix(0), y: mix(1) };
}
