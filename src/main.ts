import './client/ui/style.css';
import { Game } from './client/game';
import { Intro } from './client/ui/intro';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu') as HTMLDivElement;
const play = document.getElementById('play') as HTMLButtonElement;
const restart = document.getElementById('restart') as HTMLButtonElement;
const disclaimer = document.getElementById('disclaimer') as HTMLButtonElement;

const game = new Game(canvas);
const intro = new Intro();

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
