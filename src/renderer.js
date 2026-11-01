import * as THREE from 'three';

let renderer, scene, camera, group, mesh, wire, texture;

export function initRenderer(stageEl, onLost) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stageEl.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); if (onLost) onLost(true); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { if (onLost) onLost(false); });
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1); // no perspective
  group = new THREE.Group();
  scene.add(group);
}

export function setPicture(canvas, aspect, geo) {
  camera.left = -aspect / 2;
  camera.right = aspect / 2;
  camera.updateProjectionMatrix();
  if (texture) texture.dispose();
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  group.clear();
  mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
  wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, color: 0xf2c230 }));
  wire.position.z = 0.01;
  mesh.frustumCulled = wire.frustumCulled = false;
  group.add(mesh, wire);
}

export function setGeometry(geo) {
  mesh.geometry.dispose();
  mesh.geometry = wire.geometry = geo;
}

export function resize(w, h) { renderer.setSize(w, h); }

export function draw(fit, showGrid) {
  group.scale.set(fit, fit, 1);
  wire.visible = showGrid;
  renderer.render(scene, camera);
}

// Draws the warped picture on a hidden canvas at any size and returns a PNG blob.
// It uses its own renderer, so the screen is not touched. bg: null = transparent.
export async function renderPNG(geo, picture, aspect, fit, w, h, bg) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  const tex = new THREE.CanvasTexture(picture);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  try {
    const k = Math.min(1, r.capabilities.maxTextureSize / Math.max(w, h)); // stay inside what the GPU allows
    r.setPixelRatio(1);
    r.setSize(Math.round(w * k), Math.round(h * k), false);
    if (bg) r.setClearColor(bg, 1); else r.setClearColor(0x000000, 0);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, -1, 1);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.scale.set(fit, fit, 1);
    sc.add(m);
    r.render(sc, cam);
    return await new Promise((ok, no) => r.domElement.toBlob(b => (b ? ok(b) : no(new Error('toBlob'))), 'image/png'));
  } finally {
    tex.dispose(); mat.dispose(); r.dispose(); r.forceContextLoss();
  }
}
