// A miniature match draws the two crossing tile walls behind the original menus.
export function menuBackdrop(canvas) {
  const ctx = canvas.getContext('2d');
  const cols = 28, rows = 50, size = 20;
  canvas.width = cols * size;
  canvas.height = rows * size;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  let visible = false;
  function paint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rand = n => Math.floor(Math.random() * n);
    function wall(x, y, l, b, r, t, color) {
      function tile(i, j) {
        ctx.fillStyle = '#191c20';
        ctx.fillRect(i * size, j * size, size, size);
        ctx.fillStyle = color;
        ctx.fillRect(i * size + 1, j * size + 1, size - 1, size - 1);
      }
      for (let i = l; i < r; i++) tile(i, y);
      for (let j = b; j < t; j++) tile(x, j);
    }
    const x = 1 + rand(cols - 2), y = 1 + rand(rows - 2);
    wall(x, y, 0, 0, cols, rows, '#414acb');
    const [left, right] = x < cols / 2 ? [x + 1, cols] : [0, x];
    const [top, bottom] = y < rows / 2 ? [y + 1, rows] : [0, y];
    const rx = left + rand(right - left), ry = top + rand(bottom - top);
    wall(rx, ry, left, top, right, bottom, '#ef796b');
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx * size + 1, ry * size + 1, size - 2, size - 2);
  }
  function schedule() {
    clearInterval(timer);
    if (visible && !document.hidden && !reduced.matches) timer = setInterval(paint, 3200);
  }
  reduced.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  return active => {
    if (active && !visible) paint();
    visible = active;
    canvas.hidden = !active;
    schedule();
  };
}
