import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzle } from '../web/rules.mjs';
import { holePuzzle, randomLevel, REGION_LIMIT } from '../web/holes.mjs';

function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Independent whole-board reference for small fixtures. No region decomposition.
function after(free, id) {
  const next = new Set(free);
  next.delete(id);
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    let x = id % 9 + dx, y = Math.floor(id / 9) + dy;
    while (x >= 0 && x < 9 && y >= 0 && y < 9 && free.has(y * 9 + x)) {
      next.delete(y * 9 + x);
      x += dx;
      y += dy;
    }
  }
  return next;
}

for (const ids of [[0, 2, 9, 11, 18, 19, 20], [0, 1, 2, 9, 11, 18, 19, 20, 27, 30, 31]]) {
  test('exact moves and winning choices on irregular board ' + ids.join(','), () => {
    const holes = Array.from({length: 81}, (_, i) => i).filter(i => !ids.includes(i));
    const engine = holePuzzle({holes});
    const visited = new Map();
    function check(state, free) {
      const key = [...free].join(',');
      if (visited.has(key)) return visited.get(key);
      const { winning, legal } = engine.options(state);
      const asIds = moves => moves.map(p => engine.index(...p)).sort((a,b) => a-b);
      assert.deepEqual(asIds(legal), [...free]);
      const expected = [];
      for (const id of free) {
        const remaining = after(free, id);
        const played = engine.place(state, id % 9, Math.floor(id / 9), 1);
        assert.deepEqual([...played.last.wall].sort((a,b) => a-b), [...free].filter(i => !remaining.has(i)));
        if (!check(played, remaining)) expected.push(id);
      }
      assert.deepEqual(asIds(winning), expected);
      visited.set(key, expected.length > 0);
      return expected.length > 0;
    }
    check(engine.initial, new Set(ids));
    assert.equal(engine.place(engine.initial, holes[0] % 9, Math.floor(holes[0] / 9), 1), null);
  });
}

test('every challenge starts with a forced win for the player, and following hints wins', () => {
  const boards = new Set();
  for (let seed = 1; seed <= 250; seed++) {
    const random = seeded(seed), level = randomLevel(random), game = holePuzzle(level);
    assert.deepEqual([level.width, level.height], [9, 9]);
    boards.add([...level.holes].sort((a,b) => a-b).join(','));
    let state = game.initial;
    assert.ok(state.masks.every(mask => mask < (1 << REGION_LIMIT)));
    const first = game.hint(state).moves;
    assert.ok(first.length > 0);
    for (const pos of first) {
      const player = game.place(state, ...pos, 1);
      const replies = game.options(player);
      assert.equal(replies.winning.length, 0);
      for (const reply of replies.legal) {
        const next = game.place(player, ...reply, 2);
        assert.ok(game.options(next).winning.length > 0);
      }
    }
    while (true) {
      const hints = game.hint(state).moves;
      assert.deepEqual(hints, game.options(state).winning);
      assert.ok(hints.length > 0);
      state = game.place(state, ...hints[Math.floor(random() * hints.length)], 1);
      const replies = game.options(state);
      assert.equal(replies.winning.length, 0);
      if (!replies.legal.length) break;
      state = game.place(state, ...replies.legal[Math.floor(random() * replies.legal.length)], 2);
    }
    assert.equal(state.cells[state.last.at], 1);
  }
  assert.equal(boards.size, 250);
});

test('19×19 rays stop at both row boundaries and at holes', () => {
  const free = new Set([18, 19, 37, 56, 360]);
  const holes = Array.from({length: 361}, (_, id) => id).filter(id => !free.has(id));
  const game = holePuzzle({width: 19, height: 19, holes});
  assert.deepEqual([...game.place(game.initial, 18, 0, 1).last.wall].sort((a,b) => a-b), [18, 37, 56]);
  assert.deepEqual([...game.place(game.initial, 18, 18, 1).last.wall], [360]);
  assert.equal(game.place(game.initial, 19, 0, 1), null);
});

test('19×19 layouts cover the full board and hints preserve a forced win', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const random = seeded(seed), level = randomLevel(random, 19), game = holePuzzle(level);
    assert.deepEqual([level.width, level.height], [19, 19]);
    let state = game.initial;
    assert.equal(state.cells.length, 361);
    assert.equal(game.options(state).legal.length + game.holes.size, 361);
    do {
      const hints = game.hint(state);
      assert.ok(hints.moves.length && !hints.total);
      const player = game.place(state, ...hints.moves[Math.floor(random() * hints.moves.length)], 1);
      const replies = game.options(player);
      assert.equal(replies.winning.length, 0);
      if (!replies.legal.length) break;
      state = game.place(player, ...replies.legal[Math.floor(random() * replies.legal.length)], 2);
    } while (true);
  }
});

test('the 32nd bit works as a wall, a starting cell, and a remaining singleton', () => {
  const ids = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) ids.add(y * 9 + x);
  const solver = holePuzzle({width: 9, holes: Array.from({length: 81}, (_, i) => i).filter(i => !ids.has(i))});
  const oracle = puzzle({width: 8, height: 4, marked: []});
  const seen = new Set();
  function check(a, b) {
    const key = a.masks[0];
    if (seen.has(key)) return;
    seen.add(key);
    const exact = oracle.options(b), got = solver.options(a);
    assert.deepEqual(got.winning.sort(), exact.winning.sort());
    assert.deepEqual(got.legal.sort(), exact.legal.sort());
    for (const pos of got.legal) {
      const next = solver.place(a, ...pos, 1);
      const expected = oracle.place(b, ...pos, 1);
      const wall = [...expected.last.wall].map(i => Math.floor(i / 8) * 9 + i % 8);
      assert.deepEqual([...next.last.wall].sort(), wall.sort());
      check(next, expected);
    }
  }
  check(solver.initial, oracle.initial);
  assert.ok(seen.has(-2147483648));
});

function connectedSizes(level) {
  const side = level.width;
  const free = new Set(Array.from({length: side * side}, (_, i) => i));
  for (const hole of level.holes) free.delete(hole);
  const components = [];
  while (free.size) {
    const stack = [free.values().next().value];
    free.delete(stack[0]);
    let size = 0;
    while (stack.length) {
      const id = stack.pop();
      size++;
      const x = id % side, y = Math.floor(id / side);
      for (const [nx, ny] of [[x+1,y], [x-1,y], [x,y+1], [x,y-1]]) {
        const next = ny * side + nx;
        if (nx >= 0 && nx < side && ny >= 0 && ny < side && free.delete(next)) stack.push(next);
      }
    }
    components.push(size);
  }
  return components;
}

for (const minimum of [30, 40, 50]) {
  test(`large-region boards keep ${minimum}–${minimum + 2} physically connected cells and a winning opening`, () => {
    for (const side of [9, 19]) {
      const sizes = new Set();
      for (let seed = 1; seed <= 24; seed++) {
        const rng = seeded(seed), prepared = new Map();
        const level = randomLevel(rng, side, minimum === 30 ? true : minimum, prepared);
        const components = connectedSizes(level);
        assert.equal(Math.max(...components), level.largeRegionSize);
        assert.equal(components.filter(n => n > REGION_LIMIT).length, 1);
        sizes.add(level.largeRegionSize);
        const game = holePuzzle(level, structuredClone(prepared));
        let state = game.initial;
        while (true) {
          const hints = game.hint(state);
          assert.ok(!hints.total && hints.moves.length > 0);
          const next = game.place(state, ...hints.moves[Math.floor(rng() * hints.moves.length)], 1);
          const replies = game.options(next);
          assert.equal(replies.winning.length, 0);
          if (!replies.legal.length) break;
          state = game.place(next, ...replies.legal[Math.floor(rng() * replies.legal.length)], 2);
        }
      }
      assert.deepEqual([...sizes].sort(), [minimum, minimum + 1, minimum + 2]);
    }
  });
}

test('a 52-cell solver matches the independent rectangle solver over complete games', () => {
  const ids = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 13; x++) ids.add(y * 19 + x);
  const solver = holePuzzle({width: 19, holes: Array.from({length: 361}, (_, i) => i).filter(i => !ids.has(i))});
  const reference = puzzle({width: 13, height: 4, marked: []});
  const random = seeded(5200);
  for (let run = 0; run < 60; run++) {
    let a = solver.initial, b = reference.initial;
    while (true) {
      const actual = solver.options(a), expected = reference.options(b);
      assert.deepEqual(actual.legal.sort(), expected.legal.sort());
      assert.deepEqual(actual.winning.sort(), expected.winning.sort());
      if (!actual.legal.length) break;
      const pos = actual.legal[Math.floor(random() * actual.legal.length)];
      a = solver.place(a, ...pos, 1);
      b = reference.place(b, ...pos, 1);
      const wall = [...b.last.wall].map(id => Math.floor(id / 13) * 19 + id % 13);
      assert.deepEqual([...a.last.wall].sort(), wall.sort());
    }
    assert.equal(a.masks.some(Boolean), false);
  }
});

function checkTripleLayout(level) {
  const side = level.width, holes = new Set(level.holes);
  const positions = Array.from({length: side}, (_, i) => i);
  for (const line of positions) {
    assert.ok(positions.some(x => !holes.has(line * side + x)), 'blocked row ' + line);
    assert.ok(positions.some(y => !holes.has(y * side + line)), 'blocked column ' + line);
  }
  const large = connectedSizes(level).filter(size => size > REGION_LIMIT).sort((a, b) => a - b);
  assert.equal(large.length, 3);
  assert.ok(large.every(size => size >= 50 && size <= 52));
  assert.deepEqual(large, [...level.largeRegionSizes].sort((a, b) => a - b));
}

test('crowded starts still produce separated regions with no continuous hole divider', () => {
  for (const fixed of [0, 0.25, 0.5, 0.75, 0.99999]) {
    checkTripleLayout(randomLevel(() => fixed, 19, 50, new Map(), 3));
  }
});

test('three disjoint 50–52-cell regions preserve a first-player win through the full game', () => {
  assert.throws(() => randomLevel(Math.random, 9, 50, new Map(), 3), RangeError);
  for (let seed = 1; seed <= 50; seed++) {
    const rng = seeded(seed), prepared = new Map();
    const level = randomLevel(rng, 19, 50, prepared, 3);
    checkTripleLayout(level);
    const game = holePuzzle(level, structuredClone(prepared));
    let state = game.initial;
    while (true) {
      const hints = game.hint(state);
      assert.ok(!hints.total && hints.moves.length > 0);
      const next = game.place(state, ...hints.moves[Math.floor(rng() * hints.moves.length)], 1);
      const replies = game.options(next);
      assert.equal(replies.winning.length, 0);
      if (!replies.legal.length) break;
      state = game.place(next, ...replies.legal[Math.floor(rng() * replies.legal.length)], 2);
    }
  }
});
