const MAX = 2048;              // longest side, in pixels
const MAX_BYTES = 30 * 1024 * 1024;
const MIN_SIDE = 64;

// Returns a friendly message if the file is a bad choice, or '' if it looks fine.
function problem(file) {
  if (!file) return 'No file was chosen. Please try again.';
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return 'HEIC pictures cannot be opened here. Please save the picture as PNG or JPG first.';
  if (file.type === 'image/svg+xml') return 'SVG files are not supported. Please use a PNG or JPG picture.';
  if (!file.type.startsWith('image/')) return 'That file is not a picture. Please choose a PNG or JPG file.';
  if (file.size > MAX_BYTES) return 'That picture is too big (over 30 MB). Please choose a smaller one.';
  return '';
}

export function setupUpload(input, drop, errEl, onImage, busy = (m, f) => f()) {
  async function load(file) {
    errEl.textContent = '';
    const bad = problem(file);
    if (bad) { errEl.textContent = bad; input.value = ''; return; }
    try {
      await busy('Loading picture…', async () => {
        const bmp = await createImageBitmap(file);
        if (Math.min(bmp.width, bmp.height) < MIN_SIDE) {
          bmp.close();
          throw new Error('small');
        }
        const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        onImage(c);
      });
    } catch (e) {
      errEl.textContent = e.message === 'small'
        ? 'That picture is too small. Please use one that is at least 64 pixels wide and tall.'
        : 'This picture could not be opened. The file may be damaged. Try saving it again as PNG or JPG.';
    }
    input.value = '';
  }
  input.addEventListener('change', () => load(input.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    load(e.dataTransfer.files[0]);
  });
}
