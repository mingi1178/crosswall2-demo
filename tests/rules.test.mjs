import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { puzzle } from '../web/rules.mjs';

const levels = JSON.parse(readFileSync(new URL('../web/levels.json', import.meta.url)));
// Yellow hint frames in the original WebGL player, read from top row to bottom.
const hints = [
  ['111', '111', '111'],
  ['010', '010'],
  ['010', '101', '010'],
  ['10101', '01010', '10101', '01010', '10101'],
  ['000', '111', '010'],
  ['001', '100', '010'],
  ['000', '010', '000'],
  ['000', '100', '010'],
  ['0000', '1111', '0000'],
  ['10101', '01110', '11111', '01110', '10101'],
];

test('all Starter opening hints match the original', () => {
  assert.equal(levels.length, hints.length);
  for (const [i, level] of levels.entries()) {
    const engine = puzzle(level);
    const rows = Array.from({ length: level.height }, () => Array(level.width).fill('0'));
    for (const [x, y] of engine.options(engine.initial).winning) rows[level.height - 1 - y][x] = '1';
    assert.deepEqual(rows.map(row => row.join('')), hints[i], level.asset);
  }
});

test('a mark forbids the origin, a wall crosses marks, and existing walls stop it', () => {
  const game = puzzle(levels[2]);
  assert.equal(game.place(game.initial, 1, 1, 1), null);
  const first = game.place(game.initial, 1, 2, 1);
  assert.deepEqual(first.cells, [0,1,0, 0,1,0, 1,1,1]);
  const second = game.place(first, 0, 0, 2);
  assert.deepEqual(second.cells, [2,1,0, 2,1,0, 1,1,1]);
  assert.equal(game.place(second, 0, 1, 1), null);
  assert.deepEqual(game.initial.cells, Array(9).fill(0));
});
