import * as THREE from 'three';
import { WORLD } from '../../shared/balance';
import { LAND_BASE, Terrain } from '../../shared/world/terrain';
import { ValueNoise, clamp, smoothstep } from '../../shared/rng';
import { groundTextures } from './textures';

const GRASS_A = new THREE.Color(0x4a7534);
const GRASS_B = new THREE.Color(0x62914a);
const GRASS_DEEP = new THREE.Color(0x35592c);
const GRASS_DRY = new THREE.Color(0x87904e);
const DIRT = new THREE.Color(0x6d5a3e);
const ROCK = new THREE.Color(0x77736a);
const SAND = new THREE.Color(0xc9b78e);
const BOTTOM = new THREE.Color(0x5d5238);

/** Одна плитка микрорельефа земли в метрах. */
const DETAIL_METERS = 3;

/**
 * Крупная неоднородность поверх тайла: без неё повторяющаяся текстура
 * читается решёткой до самого горизонта.
 */
const MACRO_CHUNK = /* glsl */ `
  float terrainHash(vec2 p) {
    p = fract(p * vec2(127.31, 311.7));
    p += dot(p, p + 41.53);
    return fract(p.x * p.y);
  }

  float terrainNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = terrainHash(i);
    float b = terrainHash(i + vec2(1.0, 0.0));
    float c = terrainHash(i + vec2(0.0, 1.0));
    float d = terrainHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

/**
 * Земля: сетка, продавленная функцией высоты, с процедурной текстурой
 * микрорельефа и картой нормалей. Цвет биома лежит в вершинах, а вся мелкая
 * светотень — в текстуре, поэтому склоны и берег читаются даже вблизи.
 */
export function buildTerrainMesh(terrain: Terrain, seed: number, segments: number): THREE.Mesh {
  const size = WORLD.half * 2;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tint = new ValueNoise(seed ^ 0x2f8a1c);
  const patches = new ValueNoise(seed ^ 0x63b1a7);
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
      // Пятна густой тёмной травы — крупнее, чем разброс оттенка.
      c.lerp(GRASS_DEEP, smoothstep(0.55, 0.85, patches.fbm(x * 0.012, z * 0.012, 2)) * 0.7);
      // Сухая трава на открытых буграх.
      c.lerp(GRASS_DRY, clamp((h - LAND_BASE) * 0.16, 0, 0.35));
      // На крутых склонах дёрн сползает: сначала земля, потом камень.
      const slope = terrain.slope(x, z);
      c.lerp(DIRT, smoothstep(0.3, 0.62, slope) * 0.85);
      c.lerp(ROCK, smoothstep(0.6, 0.95, slope) * 0.7);
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

  const { map, normalMap } = groundTextures(size / DETAIL_METERS);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.96,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;\n' + MACRO_CHUNK)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Две крупные октавы: пятна светлее и темнее размером в десятки метров.
        float macro = terrainNoise(vTerrainWorld.xz * 0.021) * 0.65
                    + terrainNoise(vTerrainWorld.xz * 0.006) * 0.35;
        diffuseColor.rgb *= 0.82 + macro * 0.36;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.88), macro * 0.5);`,
      );
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
