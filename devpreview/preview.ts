import * as THREE from 'three';
import { AnimalsView } from '../src/client/render/animals';
import type { Animal, AnimalKind } from '../src/shared/animals';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb3c0);
const camera = new THREE.PerspectiveCamera(40, 1200 / 500, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1200, 500);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x3a4a30, 1.4));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
sun.position.set(4, 8, 6);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6b8248, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const kinds: AnimalKind[] = ['hare', 'boar', 'cow', 'deer', 'duck'];
const animals: Animal[] = kinds.map((kind, i) => ({
  id: i,
  kind,
  x: -4.4 + i * 2.2,
  z: 0,
  y: 0,
  yaw: Math.PI * 0.75,
  state: 'walk',
  timer: 99,
  targetX: 0,
  targetZ: 0,
  homeX: 0,
  homeZ: 0,
  health: 10,
  attackTimer: 0,
  deadFor: 0,
  butchered: false,
  speed: 3,
  phase: 0,
}));

const view = new AnimalsView(animals);
scene.add(view.group);

camera.position.set(0, 1.9, 6.4);
camera.lookAt(0, 0.7, 0);

let t = 0;
function frame(): void {
  t += 0.016;
  for (const a of animals) a.phase = t;
  view.sync(animals, camera.position.x, camera.position.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
(window as unknown as { ready: boolean }).ready = true;
