import * as THREE from 'three';
import { WORLD } from '../../shared/balance';
import { LAND_BASE, Terrain } from '../../shared/world/terrain';
import { ValueNoise, clamp, smoothstep } from '../../shared/rng';

const GRASS_A = new THREE.Color(0x4f7c3a);
const GRASS_B = new THREE.Color(0x66944a);
const GRASS_DRY = new THREE.Color(0x7f8c4a);
const SAND = new THREE.Color(0xc6b48c);
const BOTTOM = new THREE.Color(0x5d5238);

/**
 * Земля — одна плоскость, продавленная функцией высоты. Плоское затенение
 * даёт гранёный низкополигональный вид без единой текстуры.
 */
export function buildTerrainMesh(terrain: Terrain, seed: number, segments: number): THREE.Mesh {
  const size = WORLD.half * 2;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tint = new ValueNoise(seed ^ 0x2f8a1c);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrain.height(x, z);
    pos.setY(i, h);

    const lakeD = Terrain.lakeDistance(x, z);
    const n = tint.fbm(x * 0.03, z * 0.03, 2);

    if (lakeD < WORLD.lakeHalf && h < WORLD.waterLevel - 0.05) {
      c.copy(BOTTOM);
    } else if (lakeD < WORLD.lakeHalf + 3 && h < WORLD.shoreHeight + 0.45) {
      c.copy(SAND);
    } else {
      c.copy(GRASS_A).lerp(GRASS_B, n);
      // Сухая трава на открытых буграх.
      c.lerp(GRASS_DRY, clamp((h - LAND_BASE) * 0.16, 0, 0.35));
      // Полоса песка у самой кромки.
      const beach = 1 - smoothstep(WORLD.lakeHalf + 1, WORLD.lakeHalf + 6, lakeD);
      c.lerp(SAND, beach * 0.85);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }),
  );
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
