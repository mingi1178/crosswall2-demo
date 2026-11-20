// Rectangles use half-open bounds. Unity's positive Y points up from the bottom.
export function puzzle(level) {
  const { width, height } = level;
  const index = (x, y) => y * width + x;
  const marked = new Set(level.marked.map(([x, y]) => index(x, y)));
  const initial = {
    cells: Array(width * height).fill(0),
    regions: [[0, 0, width, height]],
    last: null,
  };
  const cache = new Map();

  function* moves([left, bottom, right, top]) {
    for (let y = bottom; y < top; y++) {
      for (let x = left; x < right; x++) {
        if (!marked.has(index(x, y))) yield [x, y];
      }
    }
  }

  function split([left, bottom, right, top], x, y) {
    return [
      [left, bottom, x, y], [x + 1, bottom, right, y],
      [left, y + 1, x, top], [x + 1, y + 1, right, top],
    ].filter(([l, b, r, t]) => l < r && b < t);
  }

  function nimSum(regions) {
    return regions.reduce((value, region) => value ^ grundy(region), 0);
  }

  function grundy(region) {
    const key = region.join(',');
    if (cache.has(key)) return cache.get(key);
    const reachable = new Set();
    for (const [x, y] of moves(region)) {
      reachable.add(nimSum(split(region, x, y)));
    }
    let value = 0;
    while (reachable.has(value)) value++;
    cache.set(key, value);
    return value;
  }

  function options(state) {
    const total = nimSum(state.regions);
    const legal = [], winning = [];
    for (const region of state.regions) {
      const other = total ^ grundy(region);
      for (const pos of moves(region)) {
        legal.push(pos);
        if ((other ^ nimSum(split(region, ...pos))) === 0) winning.push(pos);
      }
    }
    return { legal, winning };
  }

  function place(state, x, y, owner) {
    const region = state.regions.find(([l, b, r, t]) => l <= x && x < r && b <= y && y < t);
    if (!region || marked.has(index(x, y))) return null;
    const [left, bottom, right, top] = region;
    const cells = state.cells.slice();
    const wall = new Set();
    for (let col = left; col < right; col++) wall.add(index(col, y));
    for (let row = bottom; row < top; row++) wall.add(index(x, row));
    for (const id of wall) cells[id] = owner;
    return {
      cells,
      regions: state.regions.filter(r => r !== region).concat(split(region, x, y)),
      last: { at: index(x, y), wall },
    };
  }

  return { initial, marked, index, options, place };
}
