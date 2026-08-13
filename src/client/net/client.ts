import {
  MOVE_HZ,
  PROTOCOL_VERSION,
  type ClientMessage,
  type HitAction,
  type PlayerWire,
  type ServerMessage,
  type WorldAction,
} from '../../shared/net/protocol';

/**
 * Связь с сервером. Всё общение — обычный WebSocket с JSON: двое-трое друзей,
 * экономить биты незачем, зато лог читается глазами.
 *
 * Адрес берётся из того же места, откуда открыта страница: сервер раздаёт и
 * игру, и сокет на одном порту, поэтому руками ничего вводить не надо.
 * Отдельный сервер можно указать через ?server=ws://адрес:порт.
 */

export interface NetHandlers {
  onWelcome(message: Extract<ServerMessage, { t: 'welcome' }>): void;
  onState(message: Extract<ServerMessage, { t: 'state' }>): void;
  onWorld(action: WorldAction): void;
  onJoin(player: PlayerWire): void;
  onLeave(id: number, name: string): void;
  onHurt(amount: number): void;
  onKilled(kind: 'animal' | 'zombie', id: number): void;
  onChat(name: string, text: string): void;
  onStatus(text: string, kind: 'normal' | 'bad'): void;
}

const NAME_KEY = 'krugloe-ozero-name';
const TOKEN_KEY = 'krugloe-ozero-token';

/** Куда стучаться. null — играем в одиночку. */
export function serverUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const explicit = params.get('server');
  if (explicit) return explicit;
  // Локальный vite: сервера рядом нет, играем офлайн, пока не попросили иначе.
  if (params.get('online') === null && location.port === '5173') return null;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}`;
}

/** Имя игрока: спрашивается один раз и запоминается в браузере. */
export function playerName(): string {
  const saved = localStorage.getItem(NAME_KEY);
  if (saved) return saved;
  return '';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name.slice(0, 24));
}

/** Метка этого браузера: по ней сервер узнаёт вернувшегося. */
function token(): string {
  let saved = localStorage.getItem(TOKEN_KEY);
  if (!saved) {
    saved = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(TOKEN_KEY, saved);
  }
  const params = new URLSearchParams(location.search);
  const password = params.get('pass') ?? '';
  return password ? `${password}:${saved}` : saved;
}

export class NetClient {
  private socket: WebSocket | null = null;
  private handlers: NetHandlers | null = null;
  private moveTimer = 0;
  private reconnectIn = 0;
  private tries = 0;
  private closedByUs = false;

  /** id этого игрока на сервере. 0 — пока не поздоровались. */
  selfId = 0;
  online = false;
  latency = 0;

  constructor(readonly url: string) {}

  connect(handlers: NetHandlers): void {
    this.handlers = handlers;
    this.open();
  }

  private open(): void {
    this.handlers?.onStatus(this.tries === 0 ? 'Подключаюсь к лесу…' : 'Связь потерялась, пробую снова…', 'normal');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.tries = 0;
      // Имя читаем в этот момент: в меню его могли поменять перед входом.
      this.send({ t: 'hello', version: PROTOCOL_VERSION, name: playerName() || 'Прохожий', token: token() });
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(message);
    };

    socket.onclose = () => {
      const wasOnline = this.online;
      this.online = false;
      this.socket = null;
      if (this.closedByUs) return;
      if (wasOnline) this.handlers?.onStatus('Сервер отвалился', 'bad');
      this.scheduleReconnect();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    this.tries += 1;
    // Первые попытки частые, дальше реже: сервер могли просто перезапустить.
    this.reconnectIn = Math.min(1 + this.tries * 1.5, 12);
  }

  private handle(message: ServerMessage): void {
    const h = this.handlers;
    if (!h) return;
    switch (message.t) {
      case 'welcome':
        this.selfId = message.id;
        this.online = true;
        h.onWelcome(message);
        break;
      case 'state':
        h.onState(message);
        break;
      case 'world':
        h.onWorld(message.action);
        break;
      case 'join':
        h.onJoin(message.player);
        break;
      case 'leave':
        h.onLeave(message.id, message.name);
        break;
      case 'hurt':
        h.onHurt(message.amount);
        break;
      case 'killed':
        h.onKilled(message.kind, message.id);
        break;
      case 'chat':
        h.onChat(message.name, message.text);
        break;
      case 'ping':
        this.send({ t: 'pong', time: message.time });
        break;
      case 'error':
        h.onStatus(message.text, 'bad');
        break;
      default:
        break;
    }
  }

  private send(message: ClientMessage): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  /** Своя позиция уходит двадцать раз в секунду, не каждый кадр. */
  sendMove(
    dt: number,
    pose: { x: number; y: number; z: number; yaw: number; pitch: number; speed: number; slot: number; flags: number; health: number },
  ): void {
    if (!this.online) return;
    this.moveTimer -= dt;
    if (this.moveTimer > 0) return;
    this.moveTimer = 1 / MOVE_HZ;
    this.send({ t: 'move', ...pose });
  }

  sendWorld(action: WorldAction): void {
    this.send({ t: 'world', action });
  }

  sendHit(hit: HitAction): void {
    this.send({ t: 'hit', hit });
  }

  sendChat(text: string): void {
    this.send({ t: 'chat', text });
  }

  sendProgress(blob: string): void {
    this.send({ t: 'progress', blob });
  }

  /** Тикает переподключение. Зовётся из игрового цикла. */
  update(dt: number): void {
    if (this.socket || this.closedByUs) return;
    this.reconnectIn -= dt;
    if (this.reconnectIn <= 0) this.open();
  }

  close(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
    this.online = false;
  }
}
