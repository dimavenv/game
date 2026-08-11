import * as THREE from 'three';
import { WORLD } from '../../shared/balance';
import type { QualitySettings } from '../quality';

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    float w =
      sin(p.x * 0.55 + uTime * 0.9) * 0.035 +
      sin(p.y * 0.47 - uTime * 0.7) * 0.03 +
      sin((p.x + p.y) * 1.1 + uTime * 1.6) * 0.012 +
      sin((p.x - p.y) * 2.3 - uTime * 2.1) * 0.006;
    p.z += w;
    vWave = w;
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorld = worldPos.xyz;
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
  uniform float uLakeHalf;
  varying vec3 vWorld;
  varying float vWave;
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

    // Рябь в два масштаба: крупная волна и мелкая дрожь по ней.
    vec2 big = vec2(
      sin(vWorld.x * 0.9 + uTime * 1.3),
      sin(vWorld.z * 0.8 - uTime * 1.1)
    );
    vec2 fine = vec2(
      sin(vWorld.x * 4.1 - uTime * 2.6) + sin(vWorld.z * 3.3 + uTime * 1.9),
      sin(vWorld.z * 4.7 + uTime * 2.2) + sin(vWorld.x * 3.7 - uTime * 1.7)
    );
    vec3 n = normalize(vec3(big.x * 0.06 + fine.x * 0.012, 1.0, big.y * 0.06 + fine.y * 0.012));

    float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 4.0);

    // Насколько близко берег: у кромки вода светлее и мутнее.
    float edge = uLakeHalf - max(abs(vWorld.x), abs(vWorld.z));
    float shore = 1.0 - smoothstep(0.0, 9.0, edge);
    float depthMix = clamp(1.0 - abs(vWave) * 6.0, 0.0, 1.0) * (1.0 - shore * 0.75);
    vec3 body = mix(uShallow, uDeep, depthMix);
    body = mix(body, uShallow * 1.25, shore * 0.5);

    // Отражение неба заметное, но не выбеливающее: иначе озеро выглядит асфальтом.
    vec3 col = mix(body, uSkyColor, clamp(fres * 0.55 + 0.05, 0.0, 1.0));

    vec3 h = normalize(normalize(uSunDir) + viewDir);
    float ndh = max(dot(n, h), 0.0);
    // Узкий блик плюс широкая дорожка — по ней читается направление солнца.
    col += uSunColor * pow(ndh, 260.0) * 2.6 * uSunI;
    col += uSunColor * pow(ndh, 26.0) * 0.16 * uSunI;

    // Пена у самой кромки: рваная полоса, дышащая вместе с волной.
    float ripple = vnoise(vWorld.xz * 1.7 + vec2(uTime * 0.35, -uTime * 0.28));
    float foamBand = 1.0 - smoothstep(0.0, 1.6 + ripple * 1.2, edge);
    float foam = clamp(foamBand * (0.45 + ripple * 0.9), 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.95, 0.96), foam * 0.65);

    float alpha = mix(0.95, 0.72, shore);
    gl_FragColor = vec4(col, max(alpha, foam * 0.9));
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly uniforms;

  constructor(quality: QualitySettings) {
    const size = WORLD.lakeHalf * 2;
    // Плотность сетки — от настроек: по ней бежит волна в вершинном шейдере.
    const segments = Math.max(48, Math.round(quality.terrainSegments * 0.55));
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uSkyColor: { value: new THREE.Color(0x9fc4e0) },
      uShallow: { value: new THREE.Color(0x3d6b57) },
      uDeep: { value: new THREE.Color(0x11242c) },
      uSunI: { value: 1 },
      uLakeHalf: { value: WORLD.lakeHalf },
      ...THREE.UniformsLib.fog,
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.name = 'water';
  }

  update(dt: number, sunDir: THREE.Vector3, sunColor: THREE.Color, skyColor: THREE.Color, sunI: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSkyColor.value.copy(skyColor);
    this.uniforms.uSunI.value = sunI;
  }
}
