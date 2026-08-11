import * as THREE from 'three';

export interface HumanColors {
  skin: number;
  clothes: number;
  trousers: number;
  hat?: number;
}

export type Pose = 'standing' | 'sitting';

/**
 * Гранёный человечек из простых форм — в том же стиле, что и лес.
 * Возвращает группу и функцию покачивания: НПС дышит и слегка переминается.
 */
export function buildHuman(colors: HumanColors, pose: Pose): { group: THREE.Group; update(dt: number): void } {
  const group = new THREE.Group();
  const mat = (hex: number) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, flatShading: true });

  const skin = mat(colors.skin);
  const cloth = mat(colors.clothes);
  const trousers = mat(colors.trousers);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.28), cloth);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), skin);
  const arms = new THREE.Group();
  const legs = new THREE.Group();

  const armGeo = new THREE.BoxGeometry(0.12, 0.52, 0.14);
  const legGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);

  const leftArm = new THREE.Mesh(armGeo, cloth);
  const rightArm = new THREE.Mesh(armGeo, cloth);
  const leftLeg = new THREE.Mesh(legGeo, trousers);
  const rightLeg = new THREE.Mesh(legGeo, trousers);
  arms.add(leftArm, rightArm);
  legs.add(leftLeg, rightLeg);

  if (pose === 'standing') {
    legs.position.y = 0.3;
    leftLeg.position.set(-0.12, 0, 0);
    rightLeg.position.set(0.12, 0, 0);
    torso.position.y = 0.91;
    head.position.y = 1.34;
    leftArm.position.set(-0.29, 0.94, 0.02);
    rightArm.position.set(0.29, 0.94, 0.02);
    leftArm.rotation.z = 0.12;
    rightArm.rotation.z = -0.12;
  } else {
    // Сидит: бёдра вперёд, голени вниз, спина откинута.
    leftLeg.position.set(-0.12, 0.42, 0.26);
    rightLeg.position.set(0.12, 0.42, 0.26);
    leftLeg.rotation.x = Math.PI / 2;
    rightLeg.rotation.x = Math.PI / 2;

    const shinGeo = new THREE.BoxGeometry(0.15, 0.46, 0.16);
    for (const dx of [-0.12, 0.12]) {
      const shin = new THREE.Mesh(shinGeo, trousers);
      shin.position.set(dx, 0.23, 0.52);
      legs.add(shin);
    }

    torso.position.set(0, 0.75, 0.02);
    torso.rotation.x = -0.16;
    head.position.set(0, 1.16, 0.06);
    leftArm.position.set(-0.29, 0.74, 0.12);
    rightArm.position.set(0.29, 0.74, 0.12);
    leftArm.rotation.x = -0.5;
    rightArm.rotation.x = -0.5;
  }

  group.add(torso, head, arms, legs);

  if (colors.hat !== undefined) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.1, 7), mat(colors.hat));
    hat.position.copy(head.position);
    hat.position.y += 0.13;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), mat(colors.hat));
    brim.position.copy(hat.position);
    brim.position.y -= 0.04;
    brim.position.z += 0.14;
    group.add(hat, brim);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  let phase = Math.random() * 10;
  const baseY = torso.position.y;
  const baseHeadY = head.position.y;

  return {
    group,
    update(dt: number) {
      phase += dt;
      const breath = Math.sin(phase * 1.3) * 0.012;
      torso.position.y = baseY + breath;
      head.position.y = baseHeadY + breath * 1.4;
      if (pose === 'standing') {
        leftArm.rotation.x = Math.sin(phase * 0.9) * 0.05;
        rightArm.rotation.x = -Math.sin(phase * 0.9) * 0.05;
      }
    },
  };
}

export interface NpcHandle {
  group: THREE.Group;
  /** Точка над головой — туда крепится ник. */
  labelPoint: THREE.Vector3;
  update(dt: number): void;
}

export function createNpc(
  name: 'buravchik' | 'tomer' | 'avi',
  x: number,
  y: number,
  z: number,
  rotation: number,
): NpcHandle {
  let built;
  if (name === 'buravchik') {
    built = buildHuman({ skin: 0xc79a72, clothes: 0x3f4a33, trousers: 0x2f3a44, hat: 0x4a4436 }, 'sitting');
  } else if (name === 'avi') {
    // Тот же типаж, что у брата, но в тёмном и в капюшоне.
    built = buildHuman({ skin: 0xb98553, clothes: 0x2b2f36, trousers: 0x24272c, hat: 0x1f2226 }, 'standing');
  } else {
    built = buildHuman({ skin: 0xb98553, clothes: 0xc9c0a4, trousers: 0x59544a }, 'standing');
  }

  built.group.position.set(x, y, z);
  built.group.rotation.y = rotation;

  const labelPoint = new THREE.Vector3(x, y + (name === 'buravchik' ? 1.45 : 1.62), z);
  return { group: built.group, labelPoint, update: built.update };
}
