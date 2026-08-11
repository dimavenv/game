import './client/ui/style.css';
import { Game } from './client/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu') as HTMLDivElement;
const play = document.getElementById('play') as HTMLButtonElement;

const game = new Game(canvas);

game.onPause = () => {
  menu.classList.remove('hidden');
  play.textContent = 'Продолжить';
};

const params = new URLSearchParams(location.search);
// ?nolock — режим без захвата мыши: удобно для отладки и скриншотов.
const pointerLock = !params.has('nolock');
// ?t=600 — сразу перескочить в нужную секунду суток (проверка освещения).
if (import.meta.env.DEV && params.has('t')) game.setTime(Number(params.get('t')));

play.addEventListener('click', () => {
  menu.classList.add('hidden');
  void game.start(pointerLock);
});
