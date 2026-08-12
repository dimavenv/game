import * as THREE from 'three';

/**
 * Разделочный нож. Им не дерутся: он нужен, чтобы снять с туши мясо и шкуру.
 * Поэтому вместо замаха у него пилящее движение, которое идёт всё время,
 * пока игрок разделывает добычу.
 */
export class KnifeItem {
  private readonly group = new THREE.Group();
  private clock = 0;
  private cutting = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 0.13, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85, flatShading: true }),
    );
    handle.position.y = 0.065;

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.012, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.5, metalness: 0.6 }),
    );
    guard.position.y = 0.135;

    // Клинок: тонкая пластина со скосом к острию.
    const blade = new THREE.Mesh(
      knifeBlade(),
      new THREE.MeshStandardMaterial({
        color: 0xc9d2da,
        roughness: 0.18,
        metalness: 0.85,
        flatShading: true,
      }),
    );
    blade.position.y = 0.14;

    this.group.add(handle, guard, blade);
    this.group.position.set(0.3, -0.36, -0.5);
    this.group.rotation.set(-0.5, -0.3, 0.9);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Пока идёт разделка, нож ходит взад-вперёд над тушей. */
  setCutting(active: boolean): void {
    this.cutting = active ? 1 : 0;
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.group.visible) return;

    if (this.cutting > 0) {
      const saw = Math.sin(this.clock * 11);
      this.group.position.set(0.16 + saw * 0.09, -0.44 + Math.abs(saw) * 0.03, -0.42);
      this.group.rotation.set(-1.15, -0.3 + saw * 0.22, 1.15);
    } else {
      this.group.position.set(0.3, -0.36 + Math.sin(this.clock * 1.5) * 0.006, -0.5);
      this.group.rotation.set(-0.5, -0.3, 0.9);
    }
  }
}

/** Лезвие с обухом и скосом: делаем руками, чтобы был силуэт, а не брусок. */
function knifeBlade(): THREE.BufferGeometry {
  const length = 0.21;
  const width = 0.038;
  const thick = 0.007;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, 0);
  shape.lineTo(width * 0.5, 0);
  shape.lineTo(width * 0.5, length * 0.66);
  // Скос к острию.
  shape.lineTo(width * 0.12, length);
  shape.lineTo(-width * 0.5, length * 0.78);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geometry.translate(0, 0, -thick * 0.5);
  return geometry;
}
