import { randomLevel } from './holes.mjs';

self.onmessage = ({data: {side, minimum, regionCount}}) => {
  const prepared = new Map();
  const level = randomLevel(Math.random, side, minimum, prepared, regionCount);
  self.postMessage({level, prepared});
};
