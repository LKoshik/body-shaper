// Phase 13: custom parts. Press "Add custom part", click the center, drag out the radius, type a name.
// The app then makes a size slider for it (a bulge, see bulge.js).
import { state } from './state.js';

const NS = 'http://www.w3.org/2000/svg';
const MIN_R = 0.015, MAX_R = 0.3, TAP_R = 0.05; // radius limits (fraction of picture height); a plain tap gives TAP_R

export function initParts({ stage, svg, addBtn, form, nameInput, okBtn, cancelBtn, help, onMode, onAdd }) {
  let pending = null; // { u, v, r } once the radius has been dragged
  let drag = null;    // { u, v, x, y } while the pointer is down
  let circle = null;

  const H = () => stage.getBoundingClientRect().height;
  const pos = e => {
    const r = stage.getBoundingClientRect();
    return { u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function show(u, v, r) { // preview circle
    const b = stage.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
    if (!circle) {
      circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('class', 'pc');
      svg.appendChild(circle);
    }
    circle.setAttribute('cx', u * b.width);
    circle.setAttribute('cy', v * b.height);
    circle.setAttribute('r', r * b.height);
  }
  function stop() { // leave "adding" mode
    state.adding = false;
    pending = drag = circle = null;
    svg.textContent = '';
    form.hidden = true;
    addBtn.disabled = false;
    document.body.classList.remove('adding');
    nameInput.value = '';
    onMode();
  }

  addBtn.addEventListener('click', () => {
    if (document.body.dataset.screen !== 'shape') return;
    state.adding = true;
    addBtn.disabled = true;
    document.body.classList.add('adding');
    help.textContent = 'Click the center of the part, then drag outward to set its size. (The original picture is shown while you do this.)';
    form.hidden = false;
    nameInput.hidden = okBtn.hidden = true;
    onMode();
  });

  stage.addEventListener('pointerdown', e => {
    if (!state.adding || pending) return;
    const p = pos(e);
    drag = { ...p, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
    show(p.u, p.v, 0.005);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = Math.min(MAX_R, Math.max(0.005, Math.hypot(e.clientX - drag.x, e.clientY - drag.y) / H()));
    drag.r = r;
    show(drag.u, drag.v, r);
  });
  const release = () => {
    if (!drag) return;
    const r = drag.r && drag.r >= MIN_R ? drag.r : TAP_R;
    pending = { u: drag.u, v: drag.v, r };
    drag = null;
    show(pending.u, pending.v, r);
    help.textContent = 'Type a name for this part, then press Add.';
    nameInput.hidden = okBtn.hidden = false;
    nameInput.focus();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  function ok() {
    if (!pending) return;
    const n = state.parts.length + 1;
    const part = { id: 'p' + Date.now().toString(36) + n, name: nameInput.value.trim().slice(0, 24) || 'Part ' + n, ...pending };
    state.parts.push(part);
    stop();
    onAdd(part);
  }
  okBtn.addEventListener('click', ok);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') stop(); });
  cancelBtn.addEventListener('click', stop);
  return { cancel: () => state.adding && stop() };
}
