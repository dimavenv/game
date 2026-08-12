import * as THREE from 'three';

/**
 * Огонь. Раньше это был один оранжевый конус, который просто пульсировал.
 * Теперь — несколько языков разного размера и цвета, каждый со своей фазой,
 * плюс тлеющие угли под ними и редкие искры. Материал аддитивный: с бликом
 * в постобработке пламя светится, а не выглядит наклейкой.
 */

const TONGUES = 5;

function flameMaterial(hex: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Каплевидный язык: снизу широкий, кверху вытянут в остриё. */
function tongueGeometry(radius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, 6, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Раздуваем низ и утончаем верх — конус превращается в каплю.
    const t = (y + height / 2) / height;
    const k = Math.sin(Math.min(t, 1) * Math.PI * 0.75) / 0.92;
    pos.setX(i, pos.getX(i) * (0.5 + k * 0.9));
    pos.setZ(i, pos.getZ(i) * (0.5 + k * 0.9));
  }
  geo.computeVertexNormals();
  geo.translate(0, height / 2, 0);
  return geo;
}

export interface FireHandle {
  group: THREE.Group;
  /** Сила огня: 0 — потух, 1 — полыхает. */
  set(strength: number): void;
  update(dt: number): void;
}

/**
 * Собирает огонь заданного размера. scale = 1 — костёр на поляне, меньше —
 * топка печки. sparks = false выключает искры (в закрытой печке они лишние).
 */
export function buildFire(scale: number, sparks = true): FireHandle {
  const group = new THREE.Group();

  // Угли: раскалённая подстилка, из-за которой пламя не висит в воздухе.
  const emberGeo = new THREE.CircleGeometry(0.34 * scale, 10);
  emberGeo.rotateX(-Math.PI / 2);
  const emberMaterial = flameMaterial(0xff5a12, 0.75);
  const embers = new THREE.Mesh(emberGeo, emberMaterial);
  embers.position.y = 0.02 * scale;
  group.add(embers);

  const tongues: { mesh: THREE.Mesh; phase: number; speed: number; baseY: number }[] = [];
  for (let i = 0; i < TONGUES; i++) {
    const t = i / (TONGUES - 1);
    // Центральный язык самый высокий и светлый, крайние — низкие и красные.
    const radius = (0.22 - t * 0.1) * scale;
    const height = (0.9 - t * 0.42) * scale;
    const hex = i === 0 ? 0xffd27a : i < 3 ? 0xff9a2e : 0xf2571c;
    const mesh = new THREE.Mesh(tongueGeometry(radius, height), flameMaterial(hex, 0.35 + (1 - t) * 0.2));
    const a = (i / TONGUES) * Math.PI * 2;
    const spread = i === 0 ? 0 : 0.17 * scale;
    mesh.position.set(Math.cos(a) * spread, 0.02 * scale, Math.sin(a) * spread);
    mesh.renderOrder = 2;
    group.add(mesh);
    tongues.push({ mesh, phase: i * 1.7, speed: 5 + i * 1.6, baseY: mesh.position.y });
  }

  // Искры: точки, которые поднимаются и гаснут.
  const sparkCount = sparks ? 34 : 0;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkLife = new Float32Array(sparkCount);
  const sparkVel = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkPoints = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: 0xffb457,
      size: 0.035 * scale,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sparkPoints.frustumCulled = false;
  if (sparkCount > 0) group.add(sparkPoints);

  let phase = 0;
  let strength = 0;

  return {
    group,
    set(value: number) {
      strength = Math.max(0, Math.min(1, value));
    },
    update(dt: number) {
      phase += dt;
      group.visible = strength > 0.01;
      if (!group.visible) return;

      // Общий трепет: два несинхронных синуса дают живое мерцание.
      const flicker = 1 + Math.sin(phase * 8.3) * 0.12 + Math.sin(phase * 15.7) * 0.06;
      emberMaterial.opacity = (0.34 + Math.sin(phase * 3.1) * 0.1) * strength;
      embers.scale.setScalar(0.9 + strength * 0.25);

      for (const tongue of tongues) {
        const own = 1 + Math.sin(phase * tongue.speed + tongue.phase) * 0.28;
        const height = own * flicker * strength;
        tongue.mesh.scale.set(0.75 + own * 0.3, Math.max(0.1, height), 0.75 + own * 0.3);
        // Язык клонит из стороны в сторону, будто тянет сквозняком.
        tongue.mesh.rotation.x = Math.sin(phase * 2.1 + tongue.phase) * 0.16;
        tongue.mesh.rotation.z = Math.cos(phase * 1.7 + tongue.phase) * 0.16;
        tongue.mesh.position.y = tongue.baseY + Math.sin(phase * tongue.speed * 0.5) * 0.01;
        // Держим прозрачность пониже: аддитивное смешение и так выбеливает.
        (tongue.mesh.material as THREE.MeshBasicMaterial).opacity = (0.22 + own * 0.24) * strength;
      }

      if (sparkCount === 0) return;
      const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sparkCount; i++) {
        if (sparkLife[i] <= 0) {
          // Новая искра вылетает из углей, но только пока огонь живой.
          if (Math.random() > strength * 0.05) continue;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.2 * scale;
          pos.setXYZ(i, Math.cos(a) * r, 0.05 * scale, Math.sin(a) * r);
          sparkVel[i * 3] = (Math.random() - 0.5) * 0.25;
          sparkVel[i * 3 + 1] = (0.9 + Math.random() * 0.8) * scale;
          sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
          sparkLife[i] = 0.8 + Math.random() * 0.9;
          continue;
        }
        sparkLife[i] -= dt;
        // Искру сносит вбок и она замедляется, поднимаясь.
        sparkVel[i * 3 + 1] *= 1 - dt * 0.6;
        pos.setXYZ(
          i,
          pos.getX(i) + sparkVel[i * 3] * dt,
          pos.getY(i) + sparkVel[i * 3 + 1] * dt,
          pos.getZ(i) + sparkVel[i * 3 + 2] * dt,
        );
        if (sparkLife[i] <= 0) pos.setXYZ(i, 0, -99, 0);
      }
      pos.needsUpdate = true;
    },
  };
}
