// Undo / Redo for slider changes. Each step is a snapshot of the slider values.
import { state } from './state.js';
const MAX = 100;

const snap = () => {
  const o = {};
  for (const k in state.values) if (state.values[k]) o[k] = state.values[k];
  return o;
};

export function resetHistory() { state.history = { stack: [{}], index: 0 }; }

// Call after a change is finished (slider released, reset, preset loaded).
export function commit() {
  const h = state.history, s = snap();
  if (JSON.stringify(s) === JSON.stringify(h.stack[h.index])) return false; // nothing new
  h.stack.length = h.index + 1; // a new change throws away the "redo" future
  h.stack.push(s);
  if (h.stack.length > MAX) h.stack.shift();
  h.index = h.stack.length - 1;
  return true;
}

export const canUndo = () => state.history.index > 0;
export const canRedo = () => state.history.index < state.history.stack.length - 1;

function go(d) {
  const h = state.history, i = h.index + d;
  if (i < 0 || i >= h.stack.length) return false;
  h.index = i;
  state.values = { ...h.stack[i] };
  return true;
}
export const undo = () => go(-1);
export const redo = () => go(1);
