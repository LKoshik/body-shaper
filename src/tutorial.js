// A short 4-step guide. Opens once on the first visit, and again with the "?" button.
const KEY = 'bodyshaper.tutorial';
const STEPS = [
  ['1. Add a picture', 'Drop a picture of your character. A front view, standing straight, works best.'],
  ['2. Mark the body', 'Tap the picture to place 11 dots: head, chin, shoulders, waist, hips, legs and feet. Drag a dot if it is in the wrong place.'],
  ['3. Move the sliders', 'Each slider changes one body part. Press and hold “Hold to compare” to see the original. Tap ↺ to reset one slider.'],
  ['4. Keep your work', 'Press “Save preset” to keep a look. Press “Download” to get your new picture as a PNG.']
];

export function initTutorial(dlg, openBtn) {
  let i = 0;
  const $ = s => dlg.querySelector(s);
  function show() {
    $('h2').textContent = STEPS[i][0];
    $('.tut-text').textContent = STEPS[i][1];
    $('.tut-dots').textContent = STEPS.map((_, k) => (k === i ? '●' : '○')).join(' ');
    $('.back').disabled = i === 0;
    $('.next').textContent = i === STEPS.length - 1 ? 'Got it' : 'Next';
  }
  $('.back').onclick = () => { i--; show(); };
  $('.next').onclick = () => { if (i === STEPS.length - 1) dlg.close(); else { i++; show(); } };
  $('.skip').onclick = () => dlg.close();
  dlg.addEventListener('close', () => { try { localStorage.setItem(KEY, '1'); } catch {} });
  const open = () => { i = 0; show(); dlg.showModal(); };
  openBtn.addEventListener('click', open);
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch {}
  if (!seen) open();
}
