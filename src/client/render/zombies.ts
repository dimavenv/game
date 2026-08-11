import * as THREE from 'three';
import type { Zombie } from '../../shared/zombies';
import { buildBody, type BodyRig } from './body';

const SKIN = [0x7c8a68, 0x869063, 0x6b7a5e, 0x91976a];
const RAGS = [0x3a3a34, 0x44403a, 0x2f3630, 0x4a4238];
const TROUSERS = [0x2c2f2a, 0x36322c, 0x25282a];
const HAIR = [0x2a251d, 0x3a3128, 0x1d1a16];

/**
 * Стая мертвецов: пул готовых фигур, которые просто прячутся, когда ночь
 * заканчивается. Ковыляют вразвалку, тянут руки, оседают после смерти.
 */
export class ZombieView {
  readonly group = new THREE.Group();
  private readonly rigs: BodyRig[] = [];

  constructor(max: number) {
    for (let i = 0; i < max; i++) {
      const rig = buildBody(
        {
          skin: SKIN[i % SKIN.length],
          cloth: RAGS[i % RAGS.length],
          trousers: TROUSERS[i % TROUSERS.length],
          shoes: 0x22201c,
          hair: HAIR[i % HAIR.length],
        },
        // Мертвецы разного роста — так толпа не выглядит строем клонов.
        { hunched: true, scale: 0.94 + ((i * 37) % 17) / 100 },
      );
      // Руки вытянуты вперёд и висят.
      for (let s = 0; s < 2; s++) {
        rig.shoulders[s].rotation.x = -1.15;
        rig.elbows[s].rotation.x = -0.35;
      }
      rig.shoulders[0].rotation.z = 0.18;
      rig.shoulders[1].rotation.z = -0.24;
      rig.group.visible = false;
      this.group.add(rig.group);
      this.rigs.push(rig);
    }
  }

  sync(zombies: Zombie[]): void {
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const z = zombies[i];
      if (!z || (z.state === 'dying' && z.deadFor > 4)) {
        rig.group.visible = false;
        continue;
      }

      rig.group.visible = true;
      rig.group.position.set(z.x, z.y, z.z);
      rig.group.rotation.y = z.yaw;

      if (z.state === 'dying') {
        // Оседает вперёд и уходит в землю.
        const t = Math.min(z.deadFor / 1.1, 1);
        rig.group.rotation.x = (Math.PI / 2) * t * t;
        rig.group.position.y = z.y - t * 0.25;
        continue;
      }

      rig.group.rotation.x = 0;
      const speed = z.state === 'chase' || z.state === 'attack' ? 3.2 : 1.1;
      const swing = Math.sin(z.phase * speed);
      const lift = Math.max(0, swing);

      rig.thighs[0].rotation.x = swing * 0.62;
      rig.thighs[1].rotation.x = -swing * 0.62;
      // Колено подгибается только на подъёме — иначе нога едет по земле.
      rig.knees[0].rotation.x = -lift * 0.7;
      rig.knees[1].rotation.x = -Math.max(0, -swing) * 0.7;
      rig.hips.rotation.z = swing * 0.05;
      rig.chest.rotation.z = -swing * 0.07;
      rig.head.rotation.z = Math.sin(z.phase * 0.7) * 0.12;
      rig.neck.rotation.y = Math.sin(z.phase * 0.5) * 0.18;

      const reach = z.state === 'attack' ? -0.4 : 0;
      rig.shoulders[0].rotation.x = -1.15 + reach + Math.sin(z.phase * speed * 0.5) * 0.12;
      rig.shoulders[1].rotation.x = -1.15 + reach - Math.sin(z.phase * speed * 0.5) * 0.12;
    }
  }
}
