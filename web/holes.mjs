// Small regions use native 32-bit masks. Larger ones use BigInt masks.
const DEFAULT_SIDE = 9;
export const REGION_LIMIT = 16;
const LARGE_MIN = 30;
const REGION_CHOICES = [0, LARGE_MIN, 40, 50];
const MASK_BITS = 32;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function neighbor(id, dx, dy, side) {
  const x = id % side + dx, y = Math.floor(id / side) + dy;
  return x >= 0 && x < side && y >= 0 && y < side ? y * side + x : -1;
}

function component(free, start, side) {
  const visited = new Set([start]);
  for (const id of visited) {
    for (const [dx, dy] of directions) {
      const next = neighbor(id, dx, dy, side);
      if (free.has(next)) visited.add(next);
    }
  }
  return [...visited];
}

function makeRegion(ids, side, prepared) {
  const wide = ids.length > MASK_BITS;
  const zero = wide ? 0n : 0;
  const bits = ids.map((_, i) => wide ? 1n << BigInt(i) : 1 << i);
  const bitIndex = wide ? new Map(bits.map((bit, i) => [bit, i])) : null;
  const local = new Map(ids.map((id, i) => [id, i]));
  const rays = ids.map(id => directions.map(([dx, dy]) => {
    const ray = [];
    for (let next = neighbor(id, dx, dy, side); local.has(next); next = neighbor(next, dx, dy, side)) {
      ray.push(bits[local.get(next)]);
    }
    return ray;
  }));
  const adjacent = rays.map(lines => lines.reduce((mask, ray) => mask | (ray[0] ?? zero), zero));
  const full = bits.reduce((mask, bit) => mask | bit, zero);
  // Large regions only allocate entries for positions actually visited.
  const shape = wide ? ids.join(',') : null;
  const memo = (wide && prepared?.get(shape)) || new Map([[zero, 0]]);
  if (wide) prepared?.set(shape, memo);

  function wall(mask, i) {
    let used = bits[i];
    for (const ray of rays[i]) {
      for (const bit of ray) {
        if (!(mask & bit)) break;
        used |= bit;
      }
    }
    return used;
  }

  function grundy(mask) {
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;
    // Split again if a previous wall disconnected part of this region.
    let frontier = mask & -mask;
    let part = frontier;
    while (frontier) {
      const bit = frontier & -frontier;
      const i = wide ? bitIndex.get(bit) : 31 - Math.clz32(bit);
      const more = adjacent[i] & mask & ~part;
      part |= more;
      frontier = (frontier ^ bit) | more;
    }
    let value;
    if (part !== mask) {
      value = grundy(part) ^ grundy(mask ^ part);
    } else {
      const seen = new Set();
      for (let i = 0; i < ids.length; i++) {
        if (mask & bits[i]) seen.add(grundy(mask ^ wall(mask, i)));
      }
      value = 0;
      while (seen.has(value)) value++;
    }
    memo.set(mask, value);
    return value;
  }

  return { ids, bits, full, wall, grundy };
}

export function holePuzzle(level, prepared) {
  const side = level.width ?? DEFAULT_SIDE;
  const area = side * side;
  const index = (x, y) => y * side + x;
  const holes = new Set(level.holes);
  const free = new Set(Array.from({length: area}, (_, i) => i).filter(i => !holes.has(i)));
  const address = new Array(area);
  const regions = [];
  for (const start of free) {
    const ids = component(free, start, side);
    ids.forEach((id, i) => {
      address[id] = [regions.length, i];
      free.delete(id);
    });
    regions.push(makeRegion(ids, side, prepared));
  }
  const initial = { cells: Array(area).fill(0), masks: regions.map(r => r.full), last: null };

  function options(state) {
    const total = regions.reduce((sum, r, n) => sum ^ r.grundy(state.masks[n]), 0);
    const legal = [], winning = [];
    regions.forEach((r, n) => {
      const mask = state.masks[n];
      const others = total ^ r.grundy(mask);
      r.ids.forEach((id, i) => {
        if (!(mask & r.bits[i])) return;
        const pos = [id % side, Math.floor(id / side)];
        legal.push(pos);
        if (r.grundy(mask ^ r.wall(mask, i)) === others) winning.push(pos);
      });
    });
    return { legal, winning };
  }

  function place(state, x, y, owner) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= side || y < 0 || y >= side) return null;
    const at = index(x, y);
    if (!address[at] || state.cells[at]) return null;
    const [n, i] = address[at], region = regions[n];
    const used = region.wall(state.masks[n], i);
    const cells = state.cells.slice(), masks = state.masks.slice(), wall = new Set();
    masks[n] ^= used;
    region.ids.forEach((id, j) => {
      if (used & region.bits[j]) {
        cells[id] = owner;
        wall.add(id);
      }
    });
    return { cells, masks, last: { at, wall } };
  }

  function hint(state) {
    const { legal, winning } = options(state);
    if (winning.length || !legal.length) return { moves: winning };

    // No forced win. Leave the smallest fraction of winning replies to the opponent.
    let best;
    for (const pos of legal) {
      const replies = options(place(state, ...pos, 1));
      const wins = replies.winning.length, total = replies.legal.length;
      if (!best || wins * best.total < best.wins * total) {
        best = { moves: [pos], wins, total };
      }
    }
    return best;
  }

  return { initial, index, marked: new Set(), holes, place, options, hint };
}

function growLargeRegion(order, side, random, reserved, minimum) {
  const target = minimum + Math.floor(random() * 3);
  const start = order.find(id => !reserved.has(id));
  const region = new Set([start]);
  const frontier = new Set();
  function addNeighbors(id) {
    for (const [dx, dy] of directions) {
      const next = neighbor(id, dx, dy, side);
      if (next !== -1 && !region.has(next) && !reserved.has(next)) frontier.add(next);
    }
  }
  addNeighbors(start);
  while (region.size < target) {
    const candidates = [...frontier];
    const next = candidates[Math.floor(random() * candidates.length)];
    frontier.delete(next);
    region.add(next);
    addNeighbors(next);
  }
  // The final frontier is a ring of holes that isolates this region.
  for (const id of frontier) reserved.add(id);
  return region;
}

function fillSmallRegions(free, order, side, reserved, target) {
  for (const id of order) {
    if (free.size >= target) break;
    if (reserved.has(id) || free.has(id)) continue;
    free.add(id);
    if (component(free, id, side).length > REGION_LIMIT) free.delete(id);
  }
}

// A constructive backup for crowded starts. Each winding path spans the board,
// and its five-cell-wide corridor holds at least 57 cells. Adjacent corridors
// keep a one-cell gap. The reserved corner maps to (18, 0) before reflection.
function windingSeeds(side, singleton, random) {
  const last = side - 1;
  const heights = [0, 0, 1, 2, 2, 1, 2, 3, 3, 2, 3, 4, 4, 3, 4, 5, 5, 6, 6];
  const transpose = random() < 0.5;
  function id(x, y) {
    if (transpose) [x, y] = [last - y, last - x];
    if (singleton % side === 0) x = last - x;
    if (singleton >= last * side) y = last - y;
    return y * side + x;
  }
  return [0, 6, 12].map(base => {
    const cells = new Set(), allowed = new Set();
    for (let x = 0; x < side; x++) {
      const y = base + heights[x];
      cells.add(id(x, y));
      if (x) cells.add(id(x, base + heights[x - 1]));
      for (let row = Math.max(0, y - 2); row <= Math.min(last, y + 2); row++) allowed.add(id(x, row));
    }
    return {cells, allowed};
  });
}

function packThreeRegions(order, side, random, reserved, singleton, target) {
  const neighbors = Array.from({length: side * side}, (_, id) =>
    directions.map(([dx, dy]) => neighbor(id, dx, dy, side)).filter(next => next !== -1));
  const randomAttempts = 12;
  for (let attempt = 0; attempt <= randomAttempts; attempt++) {
    const seeds = [];
    if (attempt === randomAttempts) {
      seeds.push(...windingSeeds(side, singleton, random));
    } else {
      // Choose separated starting points, then grow all three in alternating turns.
      const available = order.filter(id => !reserved.has(id));
      while (seeds.length < 3) {
        const far = available.filter(id => seeds.every(({start}) =>
          Math.abs(start % side - id % side) + Math.abs(Math.floor(start / side) - Math.floor(id / side)) >= 8));
        if (!far.length) break;
        const start = far[Math.floor(random() * far.length)];
        seeds.push({start, cells: new Set([start])});
      }
      if (seeds.length < 3) continue;
    }

    const owner = new Int8Array(side * side).fill(-1);
    const sizes = seeds.map(() => 50 + Math.floor(random() * 3));
    const fronts = seeds.map(({cells}, n) => {
      const front = new Set();
      for (const id of cells) {
        owner[id] = n;
        for (const next of neighbors[id]) front.add(next);
      }
      return front;
    });
    let stalled = false;
    while (!stalled && seeds.some(({cells}, n) => cells.size < sizes[n])) {
      for (const [n, {cells, allowed}] of seeds.entries()) {
        if (cells.size === sizes[n]) continue;
        const candidates = [];
        for (const id of fronts[n]) {
          if (owner[id] !== -1 || reserved.has(id) || (allowed && !allowed.has(id))
              || neighbors[id].some(next => owner[next] !== -1 && owner[next] !== n)) {
            fronts[n].delete(id);
          } else {
            candidates.push(id);
          }
        }
        if (!candidates.length) {
          stalled = true;
          break;
        }
        const id = candidates[Math.floor(random() * candidates.length)];
        owner[id] = n;
        cells.add(id);
        for (const next of neighbors[id]) fronts[n].add(next);
      }
    }
    if (stalled) continue;
    const free = new Set(), boundary = new Set(reserved);
    for (const {cells} of seeds) {
      for (const id of cells) {
        free.add(id);
        for (const next of neighbors[id]) if (owner[next] === -1) boundary.add(next);
      }
    }
    fillSmallRegions(free, order, side, boundary, target);
    const rows = new Set(), cols = new Set();
    for (const id of free) {
      rows.add(Math.floor(id / side));
      cols.add(id % side);
    }
    if (rows.size === side && cols.size === side) return {free, sizes};
  }
  throw new Error('세 연결 영역을 배치하지 못했습니다.');
}

export function randomLevel(random = Math.random, side = DEFAULT_SIDE, largeRegion = false, prepared, regionCount = 1) {
  const area = side * side;
  const minimum = largeRegion === true ? LARGE_MIN : Number(largeRegion);
  if (regionCount !== 1 && !(regionCount === 3 && side === 19 && minimum === 50)) {
    throw new RangeError('50칸 이상 영역 3개는 19×19 판에서 선택할 수 있습니다.');
  }
  if (!REGION_CHOICES.includes(minimum)) throw new RangeError('지원하지 않는 연결 영역 크기입니다.');
  if (minimum && area - 3 < minimum + 2) throw new RangeError('큰 영역을 배치할 공간이 부족합니다.');
  const order = Array.from({length: area}, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const target = Math.floor(area * 0.6) + Math.floor(random() * Math.ceil(area * 0.1));
  const reserved = new Set();
  let singleton;
  if (minimum) {
    singleton = order.find(id => (id % side === 0 || id % side === side - 1)
      && (id < side || id >= area - side));
    reserved.add(singleton);
    for (const [dx, dy] of directions) {
      const next = neighbor(singleton, dx, dy, side);
      if (next !== -1) reserved.add(next);
    }
  }
  let free, largeRegionSizes;
  if (regionCount === 3) {
    const packed = packThreeRegions(order, side, random, reserved, singleton, target);
    free = packed.free;
    largeRegionSizes = packed.sizes;
  } else {
    free = minimum ? growLargeRegion(order, side, random, reserved, minimum) : new Set();
    largeRegionSizes = minimum ? [free.size] : [];
    fillSmallRegions(free, order, side, reserved, target);
  }
  const level = { width: side, height: side, holes: order.filter(id => !free.has(id)) };
  if (minimum) {
    level.largeRegionSizes = largeRegionSizes;
    level.largeRegionSize = Math.max(...largeRegionSizes);
  }
  const engine = holePuzzle(level, prepared);
  const { legal, winning } = engine.options(engine.initial);
  if (!winning.length && minimum) {
    // Adding an isolated one-cell game changes XOR from 0 to 1 without cutting the large region.
    level.holes = level.holes.filter(id => id !== singleton);
  } else if (!winning.length) {
    // Every move from nim-sum zero leaves a winning position for the next player.
    // Permanent holes stop rays exactly like the wall used to prepare this opening.
    const pos = legal[Math.floor(random() * legal.length)];
    const opening = engine.place(engine.initial, ...pos, 2);
    level.holes.push(...opening.last.wall);
  }
  return level;
}
