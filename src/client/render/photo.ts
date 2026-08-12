import * as THREE from 'three';
import { GORGE } from '../../shared/balance';
import type { Terrain } from '../../shared/world/terrain';

/**
 * Фотография на стене Дантова ущелья. Небольшая — с ладонь, — прибита к
 * камню в деревянной рамке, как местная достопримечательность.
 *
 * Сам снимок лежит файлом в public/photos/. Если файла нет, остаётся пустая
 * рамка: игра не падает и ничего не выдумывает вместо него.
 */

/** Где искать снимок. Положи файл сюда — он подхватится сам. */
const PHOTO_URL = 'photos/gorge.png';
/** Размер снимка в метрах: он нарочно маленький. */
const SIZE = 0.5;

export function buildGorgePhoto(terrain: Terrain): THREE.Group {
  const group = new THREE.Group();

  // Ставим на середине щели, на левой стене, чуть выше глаз.
  const path = GORGE.path;
  const [ax, az] = path[1];
  const [bx, bz] = path[2];
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz) || 1;
  // Нормаль к оси: по ней отходим к стене и в неё же смотрим лицом снимка.
  const nx = -dz / length;
  const nz = dx / length;
  // Рамка висит у самой кромки прохода, а не на склоне за ним: за кромкой
  // стена уже поднимается, и снимок оказывался закопан выше головы.
  const offset = GORGE.halfWidth - 0.15;
  const x = mx + nx * offset;
  const z = mz + nz * offset;
  const y = terrain.height(mx, mz) + 1.55;

  group.position.set(x, y, z);
  // Снимок смотрит внутрь щели, то есть против нормали.
  group.rotation.y = Math.atan2(-nx, -nz);

  const wood = new THREE.MeshStandardMaterial({ color: 0x5a452c, roughness: 0.9, flatShading: true });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.07, SIZE + 0.07, 0.03), wood);
  frame.castShadow = true;
  group.add(frame);

  // Подложка: пока снимка нет, в рамке просто тёмная доска.
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 1 }),
  );
  backing.position.z = 0.017;
  group.add(backing);

  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({
      roughness: 0.6,
      transparent: true,
      // Своё слабое свечение: в тени щели тёмный снимок иначе просто пропадает.
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    }),
  );
  photo.position.z = 0.019;
  photo.visible = false;
  group.add(photo);

  // Гвоздик сверху: без него рамка висит в воздухе.
  const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5), wood);
  nail.rotation.x = Math.PI / 2;
  nail.position.set(0, SIZE / 2 + 0.05, -0.02);
  group.add(nail);

  new THREE.TextureLoader().load(
    PHOTO_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = photo.material as THREE.MeshStandardMaterial;
      material.map = texture;
      material.emissiveMap = texture;
      material.needsUpdate = true;
      photo.visible = true;
    },
    undefined,
    () => {
      // Файла нет — так и оставляем пустую рамку.
    },
  );

  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return group;
}
