import * as THREE from 'three';
import { RIVER, WORLD } from '../../shared/balance';
import { RIVER_PATH } from '../../shared/world/terrain';
import type { QualitySettings } from '../quality';

/**
 * Вода. Озеро и река — одна и та же поверхность с разными геометриями:
 * у каждой вершины лежит расстояние до берега (по нему идут отмель и пена) и
 * направление течения (по нему бежит рябь). У озера течения нет.
 */

const VERT = /* glsl */ `
  uniform float uTime;
  attribute float aEdge;
  attribute vec2 aFlow;
  varying vec3 vWorld;
  varying float vWave;
  varying float vEdge;
  varying vec2 vFlow;
  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    float w =
      sin(p.x * 0.55 + uTime * 0.9) * 0.035 +
      sin(p.z * 0.47 - uTime * 0.7) * 0.03 +
      sin((p.x + p.z) * 1.1 + uTime * 1.6) * 0.012 +
      sin((p.x - p.z) * 2.3 - uTime * 2.1) * 0.006;
    // У берега волна затухает: там воде негде разгуляться.
    w *= clamp(aEdge * 0.35, 0.15, 1.0);
    p.y += w;
    vWave = w;
    vEdge = aEdge;
    vFlow = aFlow;
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorld = worldPos.xyz;
    // mvPosition нужен туману из подключаемого куска.
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uSunI;
  uniform float uTime;
  uniform float uShoreSpan;
  varying vec3 vWorld;
  varying float vWave;
  varying float vEdge;
  varying vec2 vFlow;
  #include <fog_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    // Течение сносит рябь: у озера вектор нулевой и всё стоит на месте.
    vec2 drift = vFlow * uTime * 1.6;

    vec2 big = vec2(
      sin((vWorld.x - drift.x) * 0.9 + uTime * 1.3),
      sin((vWorld.z - drift.y) * 0.8 - uTime * 1.1)
    );
    vec2 fine = vec2(
      sin((vWorld.x - drift.x) * 4.1 - uTime * 2.6) + sin((vWorld.z - drift.y) * 3.3 + uTime * 1.9),
      sin((vWorld.z - drift.y) * 4.7 + uTime * 2.2) + sin((vWorld.x - drift.x) * 3.7 - uTime * 1.7)
    );
    vec3 n = normalize(vec3(big.x * 0.06 + fine.x * 0.012, 1.0, big.y * 0.06 + fine.y * 0.012));

    float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 4.0);

    // Насколько близко берег: у кромки вода светлее и мутнее.
    float shore = 1.0 - smoothstep(0.0, uShoreSpan, vEdge);
    float depthMix = clamp(1.0 - abs(vWave) * 6.0, 0.0, 1.0) * (1.0 - shore * 0.75);
    vec3 body = mix(uShallow, uDeep, depthMix);
    body = mix(body, uShallow * 1.25, shore * 0.5);

    vec3 col = mix(body, uSkyColor, clamp(fres * 0.55 + 0.05, 0.0, 1.0));

    vec3 h = normalize(normalize(uSunDir) + viewDir);
    float ndh = max(dot(n, h), 0.0);
    col += uSunColor * pow(ndh, 260.0) * 2.6 * uSunI;
    col += uSunColor * pow(ndh, 26.0) * 0.16 * uSunI;

    // Пена у самой кромки: рваная полоса, дышащая вместе с волной.
    float ripple = vnoise(vWorld.xz * 1.7 + vec2(uTime * 0.35, -uTime * 0.28) - drift);
    float foamBand = 1.0 - smoothstep(0.0, 1.6 + ripple * 1.2, vEdge);
    float foam = clamp(foamBand * (0.45 + ripple * 0.9), 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.95, 0.96), foam * 0.65);

    float alpha = mix(0.95, 0.72, shore);
    gl_FragColor = vec4(col, max(alpha, foam * 0.9));
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private readonly uniforms;

  constructor(geometry: THREE.BufferGeometry, level: number, shoreSpan: number, colors: [number, number]) {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uSkyColor: { value: new THREE.Color(0x9fc4e0) },
      uShallow: { value: new THREE.Color(colors[0]) },
      uDeep: { value: new THREE.Color(colors[1]) },
      uSunI: { value: 1 },
      uShoreSpan: { value: shoreSpan },
      ...THREE.UniformsLib.fog,
    };

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        fog: true,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.position.y = level;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, sunDir: THREE.Vector3, sunColor: THREE.Color, skyColor: THREE.Color, sunI: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSkyColor.value.copy(skyColor);
    this.uniforms.uSunI.value = sunI;
  }
}

/** Квадратное озеро: расстояние до берега считается по Чебышёву. */
export function buildLake(quality: QualitySettings): WaterSurface {
  const size = WORLD.lakeHalf * 2;
  const segments = Math.max(48, Math.round(quality.terrainSegments * 0.55));
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const edge = new Float32Array(pos.count);
  const flow = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    edge[i] = WORLD.lakeHalf - Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i)));
  }
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));

  const water = new WaterSurface(geo, WORLD.waterLevel, 9, [0x3d6b57, 0x11242c]);
  water.mesh.name = 'water';
  return water;
}

/**
 * Река: лента вдоль ломаной русла. По краям вода заходит под берег, чтобы
 * между водой и землёй не было щели.
 */
export function buildRiver(): WaterSurface {
  const across = [-1.16, -0.72, -0.3, 0, 0.3, 0.72, 1.16];
  const rows: number[][] = [];
  const flows: [number, number][] = [];

  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const [ax, az] = RIVER_PATH[i];
    const [bx, bz] = RIVER_PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.round(len / 5));
    const tx = (bx - ax) / len;
    const tz = (bz - az) / len;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      rows.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      flows.push([tx, tz]);
    }
  }
  const last = RIVER_PATH[RIVER_PATH.length - 1];
  rows.push([last[0], last[1]]);
  flows.push(flows[flows.length - 1]);

  const count = rows.length * across.length;
  const position = new Float32Array(count * 3);
  const edge = new Float32Array(count);
  const flow = new Float32Array(count * 2);
  const index: number[] = [];

  rows.forEach(([cx, cz], r) => {
    const [tx, tz] = flows[r];
    // Нормаль к течению: по ней разносим вершины поперёк русла.
    const nx = -tz;
    const nz = tx;
    across.forEach((a, c) => {
      const i = r * across.length + c;
      const off = a * RIVER.halfWidth;
      position[i * 3] = cx + nx * off;
      position[i * 3 + 1] = 0;
      position[i * 3 + 2] = cz + nz * off;
      edge[i] = Math.max(0, RIVER.halfWidth - Math.abs(off));
      flow[i * 2] = tx;
      flow[i * 2 + 1] = tz;
    });
  });

  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < across.length - 1; c++) {
      const a = r * across.length + c;
      const b = a + 1;
      const d = a + across.length;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  geo.setIndex(index);

  const water = new WaterSurface(geo, RIVER.level, 4.5, [0x4a6f5a, 0x1d3a35]);
  water.mesh.name = 'river';
  return water;
}
