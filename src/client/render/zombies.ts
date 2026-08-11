import * as THREE from 'three';
import type { Zombie } from '../../shared/zombies';

interface ZombieRig {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  arms: THREE.Group;
  legs: [THREE.Mesh, THREE.Mesh];
}

const SKIN = [0x6f7d5e, 0x77805c, 0x5f6e55];
const RAGS = [0x3a3a34, 0x44403a, 0x2f3630];

/**
 * Стая мертвецов: пул готовых фигур, которые просто прячутся,
 * когда ночь заканчивается. Ковыляют, тянут руки, оседают после смерти.
 */
export class ZombieView {
  readonly group = new THREE.Group();
  private readonly rigs: ZombieRig[] = [];

  constructor(max: number) {
    for (let i = 0; i < max; i++) {
      const rig = ZombieView.buildRig(i);
      rig.group.visible = false;
      this.group.add(rig.group);
      this.rigs.push(rig);
    }
  }

  private static buildRig(index: number): ZombieRig {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN[index % SKIN.length],
      roughness: 1,
      flatShading: true,
    });
    const rags = new THREE.MeshStandardMaterial({
      color: RAGS[index % RAGS.length],
      roughness: 1,
      flatShading: true,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.26), rags);
    torso.position.y = 0.98;
    // Сутулость: мертвец наклонён вперёд.
    torso.rotation.x = 0.22;

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), skin);
    head.position.set(0, 1.36, 0.1);

    const arms = new THREE.Group();
    const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.12);
    for (const dx of [-0.28, 0.28]) {
      const arm = new THREE.Mesh(armGeo, skin);
      arm.position.set(dx, 1.02, 0.22);
      // Руки вытянуты вперёд.
      arm.rotation.x = -1.25;
      arms.add(arm);
    }

    const legGeo = new THREE.BoxGeometry(0.15, 0.62, 0.17);
    const left = new THREE.Mesh(legGeo, rags);
    const right = new THREE.Mesh(legGeo, rags);
    left.position.set(-0.12, 0.33, 0);
    right.position.set(0.12, 0.33, 0);

    group.add(torso, head, arms, left, right);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });

    return { group, torso, head, arms, legs: [left, right] };
  }

  sync(zombies: Zombie[]): void {
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const z = zombies[i];
      if (!z) {
        rig.group.visible = false;
        continue;
      }

      if (z.state === 'dying' && z.deadFor > 4) {
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
      rig.legs[0].rotation.x = swing * 0.5;
      rig.legs[1].rotation.x = -swing * 0.5;
      rig.torso.rotation.z = swing * 0.06;
      rig.arms.rotation.x = Math.sin(z.phase * speed * 0.5) * 0.12;
      rig.head.rotation.z = Math.sin(z.phase * 0.7) * 0.1;
      // При ударе дёргается вперёд.
      if (z.state === 'attack') rig.arms.rotation.x -= 0.35;
    }
  }
}
