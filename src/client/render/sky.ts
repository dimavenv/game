import * as THREE from 'three';
import { TIME_CYCLE } from '../../shared/balance';
import { sunAltitude, sunDirection } from '../../shared/time';
import type { QualitySettings } from '../quality';

/** Ключевой кадр освещения. Между кадрами всё просто линейно смешивается. */
interface SkyKey {
  t: number;
  sun: number;
  sunI: number;
  amb: number;
  ambI: number;
  fog: number;
  fogD: number;
  top: number;
  bottom: number;
  stars: number;
}

const KEYS: SkyKey[] = [
  {
    t: 0,
    sun: 0xff9a5a,
    sunI: 0.35,
    amb: 0x3a4658,
    ambI: 0.55,
    fog: 0x6b7280,
    fogD: 0.019,
    top: 0x2c3a52,
    bottom: 0xd08a63,
    stars: 0.45,
  },
  {
    t: 60,
    sun: 0xffd9a0,
    sunI: 1.55,
    amb: 0xa8c4d8,
    ambI: 1.15,
    fog: 0xa8bcc4,
    fogD: 0.0115,
    top: 0x5f9bd6,
    bottom: 0xcfe2ea,
    stars: 0,
  },
  {
    t: 300,
    sun: 0xfff3dc,
    sunI: 2.15,
    amb: 0xc4dcea,
    ambI: 1.3,
    fog: 0xc3d6db,
    fogD: 0.0085,
    top: 0x4d8fd6,
    bottom: 0xdcecf2,
    stars: 0,
  },
  {
    t: 470,
    sun: 0xffc27a,
    sunI: 1.8,
    amb: 0xb6c6d4,
    ambI: 1.1,
    fog: 0xc2b39a,
    fogD: 0.0105,
    top: 0x4a86c8,
    bottom: 0xe6d0ae,
    stars: 0,
  },
  {
    t: 540,
    sun: 0xff8a3c,
    sunI: 1.25,
    amb: 0x7b7894,
    ambI: 0.8,
    fog: 0xb08060,
    fogD: 0.0135,
    top: 0x35476e,
    bottom: 0xe09858,
    stars: 0.08,
  },
  {
    t: 600,
    sun: 0x3c5480,
    sunI: 0.22,
    amb: 0x33415f,
    ambI: 0.46,
    fog: 0x1c2434,
    fogD: 0.017,
    top: 0x0a1020,
    bottom: 0x1a2438,
    stars: 1,
  },
  {
    t: 760,
    sun: 0x30456e,
    sunI: 0.18,
    amb: 0x2b3757,
    ambI: 0.4,
    fog: 0x141b28,
    fogD: 0.019,
    top: 0x060b16,
    bottom: 0x121a2a,
    stars: 1,
  },
  {
    t: TIME_CYCLE,
    sun: 0xff9a5a,
    sunI: 0.35,
    amb: 0x3a4658,
    ambI: 0.55,
    fog: 0x6b7280,
    fogD: 0.019,
    top: 0x2c3a52,
    bottom: 0xd08a63,
    stars: 0.45,
  },
];

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float sunI;
  uniform float uTime;
  uniform float uNight;
  uniform float uCloud;
  varying vec3 vDir;

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

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + 11.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(bottomColor, topColor, pow(h, 0.8));

    // Луна — с той же стороны, что и невидимое солнце.
    float md = max(dot(dir, -normalize(sunDir)), 0.0);
    col += vec3(0.78, 0.82, 0.95) * smoothstep(0.99930, 0.99975, md) * uNight * 1.6;
    col += vec3(0.35, 0.45, 0.68) * pow(md, 200.0) * 0.4 * uNight;

    float d = max(dot(dir, normalize(sunDir)), 0.0);
    col += sunColor * pow(d, 320.0) * 4.0 * sunI;
    col += sunColor * pow(d, 10.0) * 0.22 * sunI;

    // Облака: шум на плоскости, спроецированной на купол.
    float up = max(dir.y, 0.0);
    if (up > 0.015) {
      vec2 uv = dir.xz / (up + 0.17) * 2.0 + vec2(uTime * 0.012, uTime * 0.008);
      float n = fbm(uv);
      // Узкая полоса перехода: между облаками остаётся чистое небо.
      float cover = smoothstep(0.50, 0.78, n) * uCloud * 1.7;
      cover *= smoothstep(0.015, 0.22, up);
      vec3 lit = mix(vec3(0.60, 0.64, 0.72), sunColor * 1.35, clamp(sunI * 0.5, 0.0, 1.0));
      vec3 shade = mix(vec3(0.13, 0.17, 0.27), vec3(0.40, 0.44, 0.53), clamp(sunI * 0.45, 0.0, 1.0));
      vec3 cloud = mix(shade, lit, smoothstep(0.48, 0.92, n));
      // Со стороны солнца край облака подсвечен.
      cloud += sunColor * pow(d, 6.0) * 0.4 * sunI;
      col = mix(col, cloud, clamp(cover, 0.0, 0.95));
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function lerpKey(a: SkyKey, b: SkyKey, u: number, out: SkyKey): void {
  out.sunI = a.sunI + (b.sunI - a.sunI) * u;
  out.ambI = a.ambI + (b.ambI - a.ambI) * u;
  out.fogD = a.fogD + (b.fogD - a.fogD) * u;
  out.stars = a.stars + (b.stars - a.stars) * u;
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  /** Цвет зенита — им подсвечивается вода. */
  readonly skyColor = new THREE.Color(0x5f9bd6);
  readonly ambient: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;

  private readonly dome: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly uniforms;
  private readonly tmp: SkyKey = { ...KEYS[0] };
  private readonly cA = new THREE.Color();
  private readonly cB = new THREE.Color();
  /** На каком расстоянии держится источник света: зависит от кадра теней. */
  private readonly sunDistance: number;
  /** Насколько игрок под землёй: 1 — дневного света нет вовсе. */
  private caveDark = 0;

  constructor(
    private readonly scene: THREE.Scene,
    quality: QualitySettings,
  ) {
    this.uniforms = {
      topColor: { value: new THREE.Color(0x5f9bd6) },
      bottomColor: { value: new THREE.Color(0xcfe2ea) },
      sunColor: { value: new THREE.Color(0xfff3dc) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunI: { value: 1 },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uCloud: { value: 0.52 },
    };

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 28),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.stars = Sky.buildStars();
    scene.add(this.stars);

    this.ambient = new THREE.HemisphereLight(0xbcd2e0, 0x2f3a2a, 1);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff3dc, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    this.sunDistance = quality.shadowRadius * 2.6;
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = this.sunDistance * 2.2;
    cam.left = -quality.shadowRadius;
    cam.right = quality.shadowRadius;
    cam.top = quality.shadowRadius;
    cam.bottom = -quality.shadowRadius;
    // Без этого у камеры теней остаётся стандартный кадр 10x10 м,
    // и всё вокруг игрока попадает в ложную тень.
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fog = new THREE.FogExp2(0xc3d6db, 0.0085);
    scene.fog = this.fog;
    scene.background = null;
  }

  private static buildStars(): THREE.Points {
    const count = 1800;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Только верхняя полусфера — нижнюю всё равно закрывает земля.
      const u = Math.random();
      const theta = Math.random() * Math.PI * 2;
      const y = 0.05 + u * 0.95;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(theta) * r * 840;
      pos[i * 3 + 1] = y * 840;
      pos[i * 3 + 2] = Math.sin(theta) * r * 840;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.renderOrder = -999;
    return points;
  }

  /**
   * В пещере дневного света нет. Гасим солнце и рассеянный свет и придвигаем
   * туман вплотную — без фонарика там и правда ничего не видно.
   */
  setCaveDark(amount: number): void {
    this.caveDark = Math.max(0, Math.min(1, amount));
  }

  update(t: number, dt: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value += dt;
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const u = (t - a.t) / (b.t - a.t);
    lerpKey(a, b, u, this.tmp);

    const dir = sunDirection(t);
    const above = sunAltitude(t) > 0;
    // Ночью с той же стороны светит луна — просто разворачиваем источник.
    const lx = above ? dir[0] : -dir[0];
    const ly = above ? dir[1] : -dir[1];
    const lz = above ? dir[2] : -dir[2];

    this.uniforms.sunDir.value.set(dir[0], dir[1], dir[2]);
    this.uniforms.sunI.value = above ? this.tmp.sunI : 0.05;
    this.uniforms.uNight.value = this.tmp.stars;
    this.cA.setHex(a.top);
    this.cB.setHex(b.top);
    this.uniforms.topColor.value.copy(this.cA).lerp(this.cB, u);
    this.skyColor.copy(this.uniforms.topColor.value);
    this.cA.setHex(a.bottom);
    this.cB.setHex(b.bottom);
    this.uniforms.bottomColor.value.copy(this.cA).lerp(this.cB, u);
    this.cA.setHex(a.sun);
    this.cB.setHex(b.sun);
    this.uniforms.sunColor.value.copy(this.cA).lerp(this.cB, u);

    const daylight = 1 - this.caveDark;
    this.sun.color.copy(this.uniforms.sunColor.value);
    this.sun.intensity = this.tmp.sunI * daylight;
    // Ночью тени выключаем: лунного света мало, а граница карты теней
    // читается уродливой полосой поперёк леса.
    this.sun.castShadow = this.tmp.sunI > 0.45 && this.caveDark < 0.4;

    this.cA.setHex(a.amb);
    this.cB.setHex(b.amb);
    this.ambient.color.copy(this.cA).lerp(this.cB, u);
    this.ambient.groundColor.copy(this.ambient.color).multiplyScalar(0.55);
    // Под землёй остаётся только слабая подсветка, чтобы стены не были чернотой.
    this.ambient.intensity = this.tmp.ambI * daylight + this.caveDark * 0.09;

    this.cA.setHex(a.fog);
    this.cB.setHex(b.fog);
    this.fog.color.copy(this.cA).lerp(this.cB, u).multiplyScalar(1 - this.caveDark * 0.92);
    this.fog.density = this.tmp.fogD + this.caveDark * 0.055;

    const mat = this.stars.material as THREE.PointsMaterial;
    mat.opacity = this.tmp.stars;
    mat.visible = this.tmp.stars > 0.01;

    // Небо и звёзды всегда вокруг камеры, тень — всегда под ногами.
    const p = camera.position;
    this.dome.position.copy(p);
    this.stars.position.copy(p);
    const dist = this.sunDistance;
    this.sun.position.set(p.x + lx * dist, p.y + ly * dist, p.z + lz * dist);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    this.scene.matrixWorldNeedsUpdate = true;
  }
}
