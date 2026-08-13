import * as THREE from 'three';
import { POSE, type PlayerWire } from '../../shared/net/protocol';
import { buildBody, type BodyColors, type BodyRig } from './body';

/**
 * Другие игроки в лесу. Снимки приходят двенадцать раз в секунду, а рисуем мы
 * шестьдесят, поэтому каждая фигура едет к последней присланной точке плавно —
 * иначе товарищ телепортируется рывками.
 *
 * Ноги шагают от присланной скорости, голова смотрит по pitch, приседание
 * подсаживает таз. Над головой висит ник — его считает UI, здесь только точка.
 */

/** Высота таза в собранной фигуре: от неё считаются приседание и оседание. */
const HIPS = 0.92;

/** Раскраски: первый зашедший ходит в синем, второй в бордовом и так далее. */
const LOOKS: BodyColors[] = [
  { skin: 0xc79a72, cloth: 0x3c5a78, trousers: 0x2f3a44, shoes: 0x2e2a24, hair: 0x33291f },
  { skin: 0xbf8b5e, cloth: 0x7a3b38, trousers: 0x3a3630, shoes: 0x2a2622, hair: 0x241d17 },
  { skin: 0xd0a374, cloth: 0x4a6b45, trousers: 0x36322c, shoes: 0x2c2824, hair: 0x4a3a28 },
  { skin: 0xb8865a, cloth: 0x6d5f34, trousers: 0x2c3138, shoes: 0x241f1b, hair: 0x1f1a15 },
];

interface Remote {
  rig: BodyRig;
  /** Куда едем: последнее, что прислал сервер. */
  target: THREE.Vector3;
  targetYaw: number;
  speed: number;
  pitch: number;
  flags: number;
  phase: number;
  name: string;
  /** Точка над головой под ник. */
  labelPoint: THREE.Vector3;
  seen: number;
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private readonly people = new Map<number, Remote>();

  /** Кто сейчас в лесу — для подписей над головами. */
  get all(): { id: number; name: string; point: THREE.Vector3; health: number }[] {
    const out: { id: number; name: string; point: THREE.Vector3; health: number }[] = [];
    for (const [id, person] of this.people) {
      out.push({ id, name: person.name, point: person.labelPoint, health: person.seen });
    }
    return out;
  }

  has(id: number): boolean {
    return this.people.has(id);
  }

  /** Заводит фигуру для нового игрока. */
  add(wire: PlayerWire): void {
    if (this.people.has(wire.id)) {
      this.apply(wire);
      return;
    }
    const rig = buildBody(LOOKS[wire.id % LOOKS.length], { scale: 1 });
    rig.group.position.set(wire.x, wire.y, wire.z);
    rig.group.rotation.y = wire.yaw;
    // Руки вдоль тела с лёгким разводом — иначе фигура выглядит распятой.
    for (let s = 0; s < 2; s++) rig.elbows[s].rotation.x = -0.24;
    rig.shoulders[0].rotation.z = 0.11;
    rig.shoulders[1].rotation.z = -0.11;
    this.group.add(rig.group);

    this.people.set(wire.id, {
      rig,
      target: new THREE.Vector3(wire.x, wire.y, wire.z),
      targetYaw: wire.yaw,
      speed: 0,
      pitch: 0,
      flags: 0,
      phase: Math.random() * 6,
      name: wire.name,
      labelPoint: new THREE.Vector3(wire.x, wire.y + 1.85, wire.z),
      seen: wire.health,
    });
  }

  remove(id: number): void {
    const person = this.people.get(id);
    if (!person) return;
    this.group.remove(person.rig.group);
    this.people.delete(id);
  }

  clear(): void {
    for (const id of [...this.people.keys()]) this.remove(id);
  }

  /** Применяет снимок: кто пропал из списка — тот вышел. */
  sync(players: PlayerWire[]): void {
    const alive = new Set<number>();
    for (const wire of players) {
      alive.add(wire.id);
      if (!this.people.has(wire.id)) this.add(wire);
      else this.apply(wire);
    }
    for (const id of [...this.people.keys()]) {
      if (!alive.has(id)) this.remove(id);
    }
  }

  private apply(wire: PlayerWire): void {
    const person = this.people.get(wire.id);
    if (!person) return;
    person.target.set(wire.x, wire.y, wire.z);
    person.targetYaw = wire.yaw;
    person.speed = wire.speed;
    person.pitch = wire.pitch;
    person.flags = wire.flags;
    person.name = wire.name;
    person.seen = wire.health;
  }

  update(dt: number): void {
    for (const person of this.people.values()) {
      const { rig } = person;
      const pos = rig.group.position;

      // Догоняем присланную точку. Далеко отстали — прыгаем сразу: значит,
      // человека телепортировали (смерть, катамаран) или связь моргнула.
      if (pos.distanceToSquared(person.target) > 100) pos.copy(person.target);
      else pos.lerp(person.target, Math.min(1, dt * 12));

      // Поворот по кратчайшей дуге.
      let diff = person.targetYaw - rig.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rig.group.rotation.y += diff * Math.min(1, dt * 10);

      const dead = (person.flags & POSE.dead) !== 0;
      const sitting = (person.flags & POSE.sit) !== 0;
      const crouch = (person.flags & POSE.crouch) !== 0;

      person.phase += dt * (1 + person.speed * 1.6);
      const swing = Math.min(person.speed / 5.5, 1);
      const step = Math.sin(person.phase * 4.2) * swing * 0.85;

      if (dead) {
        // Осел на месте: колени подогнуты, корпус завален вперёд.
        rig.group.rotation.x = Math.PI / 2.4;
        rig.hips.position.y = HIPS * 0.5;
      } else {
        rig.group.rotation.x = 0;
        rig.hips.position.y = sitting ? HIPS * 0.55 : crouch ? HIPS * 0.68 : HIPS;
      }

      if (sitting) {
        for (let i = 0; i < 2; i++) {
          rig.thighs[i].rotation.x = -Math.PI / 2 + 0.12;
          rig.knees[i].rotation.x = Math.PI / 2 - 0.22;
        }
      } else {
        rig.thighs[0].rotation.x = step;
        rig.thighs[1].rotation.x = -step;
        rig.knees[0].rotation.x = Math.max(0, -step * 0.9);
        rig.knees[1].rotation.x = Math.max(0, step * 0.9);
      }

      // Руки идут в противофазу ногам, голова смотрит туда же, куда игрок.
      rig.shoulders[0].rotation.x = -step * 0.7;
      rig.shoulders[1].rotation.x = step * 0.7;
      rig.neck.rotation.x = THREE.MathUtils.clamp(-person.pitch, -0.7, 0.7);

      person.labelPoint.set(pos.x, pos.y + (sitting ? 1.45 : 1.85), pos.z);
    }
  }
}
