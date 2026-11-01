// Small helpers: a message toast and a "please wait" overlay.
const $ = id => document.getElementById(id);
let timer;

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// Shows the spinner, lets the browser paint it, then runs the slow work.
export async function busy(msg, work) {
  $('busy-msg').textContent = msg;
  $('busy').hidden = false;
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  try { return await work(); } finally { $('busy').hidden = true; }
}
