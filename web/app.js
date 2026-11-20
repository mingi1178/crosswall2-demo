import { holePuzzle, randomLevel } from './holes.mjs';
import { puzzle } from './rules.mjs';
import levels from './levels.json';

const $ = id => document.getElementById(id);
let number, level, engine, preparedValues;
let boardWorker, boardWorkerUrl;
let turns = [], cursor = 0;
let phase = 'ready', timer, hint = null;

function screen(name) {
  clearTimeout(timer);
  boardWorker?.terminate();
  boardWorker = null;
  $('game').dataset.screen = name;
  $('home').hidden = name !== 'home';
  $('selection').hidden = !['stage', 'levels', 'preparing'].includes(name);
  $('preparation').hidden = name !== 'preparing';
  $('starter').hidden = $('challenge').hidden = $('challenge-large').hidden = name !== 'stage';
  $('large-region-option').hidden = name !== 'stage';
  $('levels').hidden = name !== 'levels';
  $('match').hidden = name !== 'match';
  $('menu-title').textContent = name === 'levels' ? 'Starter' : 'crosswall';
}

function start(i, layout = levels[i], prepared) {
  number = i;
  level = layout;
  preparedValues = prepared;
  engine = i === null ? holePuzzle(level, prepared) : puzzle(level);
  turns = [{ state: engine.initial, phase: 'ready' }];
  cursor = 0;
  phase = 'ready';
  hint = null;
  screen('match');
  $('match').classList.toggle('challenge-match', i === null);
  $('zoom').hidden = level.width !== 19;
  setZoom(false);
  $('level-title').textContent = i === null ? level.width + '×' + level.height + ' 필승 도전' : 'Starter ' + (i + 1);
  $('board').style.setProperty('--cols', level.width);
  $('board').replaceChildren();
  for (let y = level.height - 1; y >= 0; y--) {
    for (let x = 0; x < level.width; x++) {
      const button = document.createElement('button');
      button.dataset.cell = engine.index(x, y);
      button.addEventListener('click', () => play(x, y));
      $('board').append(button);
    }
  }
  const destination = i === null ? '새 랜덤판' : (i + 1 === levels.length ? '메인 화면으로' : '다음 레벨');
  $('advance').setAttribute('aria-label', destination);
  $('advance').title = destination;
  render(engine.initial);
}

function render(state) {
  const choices = hint?.moves ?? [];
  const suggestions = new Set(choices.map(pos => engine.index(...pos)));
  for (const button of $('board').children) {
    const i = Number(button.dataset.cell);
    const owner = state.cells[i];
    const marked = engine.marked.has(i);
    const hole = engine.holes?.has(i) ?? false;
    button.className = 'tile';
    if (owner) button.classList.add(owner === 1 ? 'player' : 'computer');
    if (marked) button.classList.add('mark');
    if (hole) button.classList.add('hole');
    if (state.last?.wall.has(i)) button.classList.add(state.last.at === i ? 'origin' : 'recent');
    if (suggestions.has(i)) button.classList.add('suggested');
    const locked = owner !== 0 || marked || hole || phase !== 'ready';
    button.setAttribute('aria-disabled', String(locked));
    button.tabIndex = locked ? -1 : 0;
    const w = level.width;
    const row = level.height - Math.floor(i / w);
    const label = hole ? '구멍' : owner ? (owner === 1 ? '내 벽' : '컴퓨터 벽') : (marked ? '금지 칸' : '빈칸');
    button.setAttribute('aria-label', row + '행 ' + (i % w + 1) + '열, ' + label + (suggestions.has(i) ? ', 추천 수' : ''));
  }
  $('result').hidden = phase !== 'win';
  $('controls').hidden = phase === 'win';
  $('prev').hidden = cursor === 0 || phase === 'computer';
  $('next').hidden = cursor >= turns.length - 1 || phase === 'computer';
  $('hint').hidden = phase !== 'ready' || (number !== null && Boolean(hint));
  $('hint').setAttribute('aria-pressed', String(Boolean(hint)));
  $('new-board').hidden = number !== null;
  $('prev').classList.toggle('emphasis', phase === 'loss' || (hint && choices.length === 0));
  let message = cursor ? '내 차례입니다.' : '빈칸을 눌러 십자 벽을 놓으세요. 마지막 수를 두면 승리합니다.';
  if (number === null && !cursor) message = '내가 선공입니다. 첫 필승 수를 찾아보세요.';
  if (!cursor && level.largeRegionSize) message = `가장 큰 연결 영역은 ${level.largeRegionSize}칸입니다. 내가 선공입니다.`;
  if (!cursor && level.largeRegionSizes?.length === 3) {
    message = `큰 영역 3개 · ${level.largeRegionSizes.join('칸, ')}칸 · 내가 선공입니다.`;
  }
  if (hint) message = choices.length ? '노란 테두리에서 승리하는 수를 선택하세요.' : '이 위치에는 승리하는 수가 없습니다.';
  if (hint?.total) {
    message = `필승 수는 없습니다. 노란 칸에 두면 컴퓨터의 응수 ${hint.total}개 중 ${hint.wins}개가 필승 수입니다. 이 비율이 가장 낮습니다.`;
  }
  if (phase === 'computer') message = '컴퓨터 차례입니다.';
  if (phase === 'loss') message = '컴퓨터 승리 · 한 수 되돌려 다시 도전하세요.';
  if (phase === 'loss' && number === null) message = '컴퓨터 승리 · 새 판으로 다시 도전하세요.';
  if (phase === 'win') message = '승리했습니다!';
  $('status').textContent = message;
}

function setZoom(active) {
  const view = $('board-view');
  view.classList.toggle('zoomed', active);
  $('zoom').setAttribute('aria-pressed', String(active));
  $('zoom').textContent = active ? '전체 보기' : '판 확대';
  if (active) {
    view.scrollLeft = (view.scrollWidth - view.clientWidth) / 2;
    view.scrollTop = (view.scrollHeight - view.clientHeight) / 2;
  } else {
    view.scrollTo(0, 0);
  }
}

function record(state, outcome) {
  phase = outcome;
  turns.push({ state, phase });
  cursor = turns.length - 1;
  render(state);
}

function play(x, y) {
  if (phase !== 'ready') return;
  const player = engine.place(turns[cursor].state, x, y, 1);
  if (!player) return;
  hint = null;
  turns.length = cursor + 1;
  const { winning, legal } = engine.options(player);
  if (!legal.length) {
    record(player, 'win');
    $('advance').focus({preventScroll: true});
    return;
  }
  phase = 'computer';
  render(player);
  timer = setTimeout(() => {
    const candidates = winning.length ? winning : legal;
    const pos = candidates[Math.floor(Math.random() * candidates.length)];
    const computer = engine.place(player, ...pos, 2);
    const hasMoves = number === null ? computer.masks.some(Boolean) : engine.options(computer).legal.length > 0;
    record(computer, hasMoves ? 'ready' : 'loss');
  }, 320);
}

function review(offset) {
  const target = cursor + offset;
  if (phase === 'computer' || !turns[target]) return;
  cursor = target;
  hint = null;
  phase = turns[cursor].phase;
  render(turns[cursor].state);
}

$('play').onclick = () => screen('stage');
function startRandom(side) {
  const choice = $('large-region').value;
  const regionCount = choice === '50x3' ? 3 : 1;
  const minimum = regionCount === 3 ? 50 : Number(choice);
  if (minimum < 40) {
    start(null, randomLevel(Math.random, side, minimum));
    return;
  }
  screen('preparing');
  $('preparation').textContent = `${side}×${side} 판의 필승 수를 계산 중입니다…`;
  try {
    boardWorkerUrl ??= URL.createObjectURL(new Blob([BOARD_WORKER_SOURCE], {type: 'text/javascript'}));
    const worker = new Worker(boardWorkerUrl);
    boardWorker = worker;
    worker.onmessage = ({data}) => {
      if (boardWorker === worker) start(null, data.level, data.prepared);
    };
    worker.onerror = () => {
      if (boardWorker !== worker) return;
      worker.terminate();
      boardWorker = null;
      $('preparation').textContent = '판을 준비하지 못했습니다. 뒤로 가서 다시 선택해 주세요.';
    };
    worker.postMessage({side, minimum, regionCount});
  } catch {
    const prepared = new Map();
    start(null, randomLevel(Math.random, side, minimum, prepared, regionCount), prepared);
  }
}
function updateBoardChoices() {
  $('challenge').disabled = $('large-region').value === '50x3';
}
$('large-region').onchange = updateBoardChoices;
updateBoardChoices();
$('challenge').onclick = () => startRandom(9);
$('challenge-large').onclick = () => startRandom(19);
$('new-board').onclick = () => startRandom(level.width);
$('starter').onclick = () => screen('levels');
document.querySelector('#selection .back').onclick = () => screen($('game').dataset.screen === 'stage' ? 'home' : 'stage');
document.querySelector('#match .back').onclick = () => screen('home');
$('restart').onclick = $('replay').onclick = () => start(number, level, preparedValues);
$('advance').onclick = () => {
  if (number === null) startRandom(level.width);
  else if (number + 1 < levels.length) start(number + 1);
  else screen('home');
};
$('zoom').onclick = () => setZoom(!$('board-view').classList.contains('zoomed'));
$('prev').onclick = () => review(-1);
$('next').onclick = () => review(1);
$('hint').onclick = () => {
  if (phase !== 'ready') return;
  const state = turns[cursor].state;
  if (hint) hint = null;
  else hint = number === null ? engine.hint(state) : { moves: engine.options(state).winning };
  render(state);
};

screen('home');
levels.forEach((_, i) => {
  const button = document.createElement('button');
  button.textContent = i + 1;
  button.setAttribute('aria-label', 'Starter ' + (i + 1));
  button.onclick = () => start(i);
  $('levels').append(button);
});
