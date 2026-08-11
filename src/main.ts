import './client/ui/style.css';
import { Game } from './client/game';
import { Intro } from './client/ui/intro';
import { QUALITY, QUALITY_ORDER, loadQuality, saveQuality } from './client/quality';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu') as HTMLDivElement;
const play = document.getElementById('play') as HTMLButtonElement;
const restart = document.getElementById('restart') as HTMLButtonElement;
const disclaimer = document.getElementById('disclaimer') as HTMLButtonElement;
const qualityButtons = document.getElementById('quality-buttons') as HTMLDivElement;

const game = new Game(canvas);
const intro = new Intro();

// Качество применяется при сборке сцены, поэтому смена — через перезагрузку.
const chosen = loadQuality();
for (const level of QUALITY_ORDER) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = QUALITY[level].label;
  if (level === chosen) button.classList.add('active');
  button.addEventListener('click', () => {
    if (level === chosen) return;
    saveQuality(level);
    game.saveNow();
    location.reload();
  });
  qualityButtons.appendChild(button);
}

// При первом заходе — заставка и предупреждение, меню ждёт своей очереди.
if (!Intro.seen) {
  menu.classList.add('hidden');
  void intro.play().then(() => menu.classList.remove('hidden'));
}

disclaimer.addEventListener('click', () => {
  menu.classList.add('hidden');
  void intro.showOnly().then(() => menu.classList.remove('hidden'));
});

game.onPause = () => {
  menu.classList.remove('hidden');
  play.textContent = 'Продолжить';
};

const params = new URLSearchParams(location.search);
// ?nolock — режим без захвата мыши: удобно для отладки и скриншотов.
const pointerLock = !params.has('nolock');
// ?t=600 — сразу перескочить в нужную секунду суток (проверка освещения).
if (import.meta.env.DEV && params.has('t')) game.setTime(Number(params.get('t')));

restart.addEventListener('click', () => {
  if (confirm('Начать заново? Весь прогресс пропадёт.')) game.restart();
});

play.addEventListener('click', () => {
  menu.classList.add('hidden');
  void game.start(pointerLock);
});
