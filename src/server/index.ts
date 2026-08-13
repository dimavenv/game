import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import { WORLD_SEED } from '../shared/balance';
import {
  PROTOCOL_VERSION,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  type ClientMessage,
  type ServerMessage,
} from '../shared/net/protocol';
import { Room, type RoomSave } from './room';

/**
 * Сервер «Круглого озера». Одним процессом делает две вещи:
 *
 *  1. Раздаёт саму игру из dist/ — чтобы на VPS не поднимать отдельный nginx.
 *  2. Держит WebSocket на том же порту: клиент сам подключается к тому адресу,
 *     с которого его загрузили, так что настраивать в браузере нечего.
 *
 * Настройки — через переменные окружения:
 *   PORT      порт (по умолчанию 8080)
 *   HOST      адрес (по умолчанию 0.0.0.0)
 *   SEED      сид мира; менять после начала игры нельзя — лес станет другим
 *   SAVE      файл сохранения (по умолчанию ./save/world.json)
 *   PASSWORD  если задан, без него в лес не пускают
 */

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const SEED = process.env.SEED ?? WORLD_SEED;
const SAVE_PATH = resolve(process.env.SAVE ?? 'save/world.json');
const PASSWORD = process.env.PASSWORD ?? '';
const STATIC_ROOT = resolve(process.env.STATIC ?? 'dist');

const room = new Room(SEED);

// --- Сохранение ---------------------------------------------------------

async function load(): Promise<void> {
  if (!existsSync(SAVE_PATH)) {
    log(`сохранения нет, лес новый (сид ${SEED})`);
    return;
  }
  try {
    const raw = await readFile(SAVE_PATH, 'utf8');
    const save = JSON.parse(raw) as RoomSave;
    if (save.seed !== SEED) {
      log(`ВНИМАНИЕ: в сохранении сид ${save.seed}, а запущен ${SEED}. Мир не совпадёт — сохранение не читаю`);
      return;
    }
    room.restore(save);
    log(`сохранение прочитано: день ${room.clock.day}, построек ${save.world.structures.length}`);
  } catch (error) {
    log(`сохранение битое, начинаю заново: ${(error as Error).message}`);
  }
}

let saving = false;
async function save(): Promise<void> {
  if (saving) return;
  saving = true;
  try {
    await mkdir(dirname(SAVE_PATH), { recursive: true });
    await writeFile(SAVE_PATH, JSON.stringify(room.toSave()), 'utf8');
  } catch (error) {
    log(`не смог сохранить: ${(error as Error).message}`);
  } finally {
    saving = false;
  }
}

// --- Раздача игры -------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, day: room.clock.day, time: Math.round(room.clock.t) }));
    return;
  }

  // normalize + отсечка «..»: наружу из dist/ никто не выйдет.
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATIC_ROOT, relative);
  if (!file.startsWith(STATIC_ROOT)) {
    res.writeHead(403).end('нельзя');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_ROOT, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Игра не собрана. Запусти npm run build');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

// --- Сеть ---------------------------------------------------------------

interface Client {
  socket: WebSocket;
  id: number;
  name: string;
  /** Сколько опросов подряд остались без ответа. */
  silent: number;
}

const clients = new Map<number, Client>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage, except?: number): void {
  const text = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.id === except) continue;
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(text);
  }
}

function log(text: string): void {
  const now = new Date().toISOString().slice(11, 19);
  console.log(`[${now}] ${text}`);
}

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http });

wss.on('connection', (socket) => {
  let client: Client | null = null;

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }

    // Первое слово всегда «hello»: до него игрока в лесу нет.
    if (!client) {
      if (message.t !== 'hello') return;
      if (message.version !== PROTOCOL_VERSION) {
        send(socket, { t: 'error', text: 'Версия игры не совпала с сервером. Обнови страницу' });
        socket.close();
        return;
      }
      if (PASSWORD && message.token.split(':')[0] !== PASSWORD) {
        send(socket, { t: 'error', text: 'Пароль не подошёл' });
        socket.close();
        return;
      }
      const name = (message.name || 'Прохожий').slice(0, 24);
      const player = room.join(name, message.token.slice(0, 96));
      client = { socket, id: player.id, name, silent: 0 };
      clients.set(player.id, client);

      send(socket, {
        t: 'welcome',
        version: PROTOCOL_VERSION,
        id: player.id,
        seed: room.seed,
        day: room.clock.day,
        time: room.clock.t,
        world: room.snapshot(),
        progress: player.progress,
        players: room.wirePlayers(player.id),
      });
      broadcast({ t: 'join', player: room.wire(player) }, player.id);
      log(`${name} зашёл (id ${player.id}), в лесу ${clients.size}`);
      return;
    }

    const player = room.player(client.id);
    if (!player) return;

    switch (message.t) {
      case 'move':
        player.x = message.x;
        player.y = message.y;
        player.z = message.z;
        player.yaw = message.yaw;
        player.pitch = message.pitch;
        player.speed = message.speed;
        player.slot = message.slot;
        player.flags = message.flags;
        player.health = message.health;
        break;
      case 'world':
        if (room.applyWorld(message.action)) {
          broadcast({ t: 'world', action: message.action, from: client.id }, client.id);
        }
        break;
      case 'hit': {
        const killed = room.applyHit(message.hit);
        if (killed) send(socket, { t: 'killed', kind: killed.kind, id: killed.id });
        break;
      }
      case 'chat': {
        const text = message.text.slice(0, 200).trim();
        if (!text) break;
        broadcast({ t: 'chat', from: client.id, name: client.name, text });
        log(`${client.name}: ${text}`);
        break;
      }
      case 'progress':
        player.progress = message.blob;
        break;
      case 'pong':
        client.silent = 0;
        break;
      default:
        break;
    }
  });

  // Ответ на ping-кадр приходит сюда сам, без участия страницы.
  socket.on('pong', () => {
    if (client) client.silent = 0;
  });

  socket.on('close', () => {
    if (!client) return;
    clients.delete(client.id);
    room.leave(client.id);
    broadcast({ t: 'leave', id: client.id, name: client.name });
    log(`${client.name} вышел, в лесу ${clients.size}`);
    void save();
  });

  socket.on('error', () => socket.close());
});

// --- Такты --------------------------------------------------------------

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  const damage = room.step(dt);
  for (const [id, amount] of damage) {
    const client = clients.get(id);
    if (client && amount > 0) send(client.socket, { t: 'hurt', amount });
  }
}, 1000 / SERVER_TICK_HZ);

setInterval(() => {
  if (clients.size === 0) return;
  const state: ServerMessage = {
    t: 'state',
    day: room.clock.day,
    time: room.clock.t,
    players: [],
    animals: room.wireAnimals(),
    zombies: room.wireZombies(),
  };
  // Каждому — все остальные, но не он сам: свою позицию он знает лучше.
  for (const client of clients.values()) {
    send(client.socket, { ...state, players: room.wirePlayers(client.id) });
  }
}, 1000 / SNAPSHOT_HZ);

/**
 * Тихо отваливающиеся соединения. Опрашиваем не своим сообщением, а ping-кадром
 * самого WebSocket: на него браузер отвечает сетевым слоем, не спрашивая
 * страницу. Занятый отрисовкой клиент из-за этого больше не вылетает.
 *
 * Терпим три пропущенных ответа подряд — три четверти минуты.
 */
setInterval(() => {
  for (const client of clients.values()) {
    if (client.silent >= 3) {
      log(`${client.name} не отвечает, отключаю`);
      client.socket.terminate();
      continue;
    }
    client.silent += 1;
    if (client.socket.readyState === client.socket.OPEN) client.socket.ping();
  }
}, 15000);

setInterval(() => void save(), 30000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log('сохраняю и выключаюсь');
    void save().then(() => process.exit(0));
  });
}

await load();
http.listen(PORT, HOST, () => {
  log(`лес открыт: http://${HOST}:${PORT}  (сид ${SEED}${PASSWORD ? ', с паролем' : ''})`);
  if (!existsSync(STATIC_ROOT)) log(`ВНИМАНИЕ: нет папки ${STATIC_ROOT} — сперва npm run build`);
});
