import './client/ui/style.css';
import { Game } from './client/game';
import { Intro } from './client/ui/intro';
import { CheatMenu } from './client/ui/cheats';
import { QUALITY, QUALITY_ORDER, loadQuality, saveQuality } from './client/quality';
import { playerName, serverUrl, setPlayerName } from './client/net/client';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu') as HTMLDivElement;
const play = document.getElementById('play') as HTMLButtonElement;
const restart = document.getElementById('restart') as HTMLButtonElement;
const disclaimer = document.getElementById('disclaimer') as HTMLButtonElement;
const qualityButtons = document.getElementById('quality-buttons') as HTMLDivElement;
const cheatOpen = document.getElementById('cheat-open') as HTMLButtonElement;
const cheatGate = document.getElementById('cheat-gate') as HTMLDivElement;
const cheatPassword = document.getElementById('cheat-password') as HTMLInputElement;
const cheatEnter = document.getElementById('cheat-enter') as HTMLButtonElement;

const nickBox = document.getElementById('nickbox') as HTMLDivElement;
const nick = document.getElementById('nick') as HTMLInputElement;

// Поле ника нужно только там, где есть сервер: в одиночной игре оно ни к чему.
const online = serverUrl() !== null;
if (online) {
  nickBox.classList.remove('hidden');
  nick.value = playerName();
  nick.addEventListener('input', () => setPlayerName(nick.value.trim()));
}

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
  if (online) setPlayerName(nick.value.trim() || 'Прохожий');
  menu.classList.add('hidden');
  void game.start(pointerLock);
});

// Тестовый режим за паролем: пока он не введён, читов в игре просто нет.
function refreshCheatButton(): void {
  cheatOpen.textContent = CheatMenu.unlocked ? 'Чит-меню (`)' : 'Тестовый режим';
}
refreshCheatButton();

cheatOpen.addEventListener('click', () => {
  if (CheatMenu.unlocked) {
    menu.classList.add('hidden');
    // Без захвата мыши: иначе панель откроется, а курсором по ней не попасть.
    // Захват вернётся сам, когда чит-меню закроют.
    void game.start(false).then(() => game.openCheats());
    return;
  }
  cheatGate.classList.toggle('hidden');
  cheatPassword.focus();
});

function tryUnlock(): void {
  if (!CheatMenu.unlock(cheatPassword.value)) {
    cheatPassword.classList.add('bad');
    cheatPassword.value = '';
    return;
  }
  cheatPassword.classList.remove('bad');
  cheatPassword.value = '';
  cheatGate.classList.add('hidden');
  refreshCheatButton();
  game.notifyCheatsUnlocked();
}

cheatEnter.addEventListener('click', tryUnlock);
cheatPassword.addEventListener('keydown', (e) => {
  cheatPassword.classList.remove('bad');
  if (e.key === 'Enter') tryUnlock();
});
