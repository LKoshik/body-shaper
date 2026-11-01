import { state, newExt } from './state.js';
import { validate } from './warp.js';
import { slot, J, mirrorAssist, smartGuesses, syncKnee } from './bones.js';
import { toast } from './ui.js';

// "Left" means the left side of the PICTURE. Same rule everywhere.
export const LANDMARKS = [
  ['Head top', 'Click the TOP of the head (hair top is fine).'],
  ['Chin', 'Click the lowest point of the CHIN.'],
  ['Left shoulder', 'Click the outer edge of the LEFT shoulder (left side of the picture).'],
  ['Right shoulder', 'Click the outer edge of the RIGHT shoulder.'],
  ['Left waist', 'Click the narrowest point on the LEFT side of the waist.'],
  ['Right waist', 'Click the narrowest point on the RIGHT side of the waist.'],
  ['Left hip', 'Click the widest point of the LEFT hip.'],
  ['Right hip', 'Click the widest point of the RIGHT hip.'],
  ['Crotch', 'Click where the legs split.'],
  ['Knee', 'Click the middle of ONE knee (only the height matters).'],
  ['Feet', 'Click the lowest point of the feet.']
];

// Points 12 to 31 (optional). Order = state.ext: neck left, neck right, 9 left-side points, 9 right-side points.
const JOINTS = [
  ['shoulder joint', 'where the {S} arm starts, a little inside the shoulder edge'],
  ['elbow', 'the center of the {S} elbow bend'],
  ['wrist', 'the center of the {S} wrist'],
  ['hand tip', 'the end of the longest finger of the {S} hand'],
  ['chest center', 'the middle of the {S} side of the chest'],
  ['hip joint', 'the top of the {S} thigh, at the side of the hip'],
  ['knee', 'the center of the {S} knee'],
  ['ankle', 'the center of the {S} ankle'],
  ['foot tip', 'the front end of the {S} foot']
];
const side = s => JOINTS.map(([name, where]) => [`${s} ${name}`, `Click ${where.replace('{S}', s.toUpperCase())}.`]);
export const EXT = [
  ['Neck left', 'Click where the neck meets the LEFT shoulder.'],
  ['Neck right', 'Click where the neck meets the RIGHT shoulder.'],
  ...side('Left'), ...side('Right')
];

const N = LANDMARKS.length, TOTAL = N + EXT.length;
const clamp = x => Math.min(1, Math.max(0, x));
const isKnee = j => j === slot('L', J.KN) || j === slot('R', J.KN);

// onChange: called whenever a point is placed, moved or removed (the bones overlay redraws).
export function initLandmarks({ stage, dots, help, undo, reset, done, mirror, guess, onChange, onDone }) {
  let drag = null;  // { el, ext, i, x, y, moved } while the pointer is down on a dot
  let acts = [];    // for Undo: the extended points each action placed, like [[2], [13, 14, 15]]

  function draw() {
    acts = acts.filter(a => a.some(j => state.ext[j])); // forget actions whose points are gone
    dots.innerHTML = '';
    const add = (num, name, p, ext, i) => {
      const d = document.createElement('div');
      d.className = ext ? 'dot ext' : 'dot';
      d.dataset.i = i;
      if (ext) d.dataset.x = '1';
      d.title = name;
      d.style.left = p.u * 100 + '%';
      d.style.top = p.v * 100 + '%';
      d.innerHTML = `<b>${num}</b><span>${name}</span>`;
      dots.appendChild(d);
    };
    state.points.forEach((p, i) => add(i + 1, LANDMARKS[i][0], p, false, i));
    state.ext.forEach((p, j) => { if (p) add(N + 1 + j, EXT[j][0], p, true, j); });

    const n = state.points.length, nx = state.ext.findIndex(p => !p);
    help.textContent = n < N
      ? `Point ${n + 1} of ${N}. ${LANDMARKS[n][1]}`
      : nx >= 0
        ? `Optional joint ${N + 1 + nx} of ${TOTAL}. ${EXT[nx][1]} Or use Mirror assist and Smart guesses, or press Done to skip the joints.`
        : `All ${TOTAL} points are placed. Drag any dot to fix it, then press Done.`;
    dots.classList.toggle('small', n >= N); // joints sit close to the first 11 dots, so the dots shrink
    done.disabled = n < N;
    mirror.disabled = guess.disabled = n < N;
    undo.disabled = n === 0 && !acts.length;
    reset.disabled = n === 0;
  }
  const redraw = () => { draw(); onChange(); };

  const pos = e => {
    const r = stage.getBoundingClientRect();
    return { u: clamp((e.clientX - r.left) / r.width), v: clamp((e.clientY - r.top) / r.height) };
  };

  // Puts the next optional joint where the pointer is. Returns false if all points are already placed.
  function placeJoint(e) {
    const j = state.ext.findIndex(p => !p);
    if (j < 0) return false;
    state.ext[j] = pos(e);
    acts.push([j]);
    if (isKnee(j)) syncKnee();
    redraw();
    return true;
  }

  stage.addEventListener('pointerdown', e => {
    if (document.body.dataset.screen !== 'mark') return;
    const dot = e.target.closest('.dot');
    if (dot) {
      drag = { el: dot, ext: !!dot.dataset.x, i: +dot.dataset.i, x: e.clientX, y: e.clientY, moved: false };
      dot.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (state.points.length < N) {
      state.points.push(pos(e));
      redraw();
    } else {
      placeJoint(e);
    }
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return; // a tap, not a drag yet
    drag.moved = true;
    const p = pos(e);
    if (drag.ext) state.ext[drag.i] = p; else state.points[drag.i] = p;
    drag.el.style.left = p.u * 100 + '%';
    drag.el.style.top = p.v * 100 + '%';
    onChange();
  });
  const stop = e => {
    if (!drag) return;
    const { ext, i, moved } = drag;
    drag = null;
    // A tap on a dot places the next joint there (joints are often right next to an earlier dot).
    if (!moved && e.type === 'pointerup' && state.points.length >= N && placeJoint(e)) return;
    if (moved && ext && isKnee(i)) { syncKnee(); redraw(); } // point 10 follows the average knee height
  };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);

  undo.addEventListener('click', () => {
    acts = acts.filter(a => a.some(j => state.ext[j]));
    const last = acts.pop();
    if (last) last.forEach(j => { state.ext[j] = null; });
    else state.points.pop();
    redraw();
  });
  reset.addEventListener('click', () => {
    state.points = [];
    state.ext = newExt();
    state.reach = {};
    acts = [];
    redraw();
  });
  mirror.addEventListener('click', () => {
    const got = mirrorAssist();
    if (!got.length) { toast('Nothing to copy yet. Place some joints on one side first.'); return; }
    acts.push(got);
    syncKnee();
    redraw();
  });
  guess.addEventListener('click', () => {
    const got = smartGuesses();
    if (!got.length) { toast('No more guesses to make. For the elbow, place the wrist first.'); return; }
    acts.push(got);
    redraw();
  });
  done.addEventListener('click', () => {
    syncKnee();
    if (!validate(state.points)) {
      help.textContent = 'Some points are in the wrong order from top to bottom (head, chin, shoulders, waist, hips, crotch, knee, feet). Drag them to fix it.';
      return;
    }
    onDone();
  });

  return redraw;
}
