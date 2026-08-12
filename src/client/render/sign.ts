import * as THREE from 'three';

/** Выгоревшая доска: дерево, тёмные прожилки, буквы будто выжжены. */
function signTexture(lines: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 320;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#9a7a52';
  ctx.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 90; i++) {
    const y = Math.random() * c.height;
    ctx.strokeStyle = `rgba(${70 + Math.random() * 40}, ${50 + Math.random() * 30}, ${30 + Math.random() * 20}, ${0.06 + Math.random() * 0.13})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.bezierCurveTo(c.width * 0.3, y + (Math.random() - 0.5) * 22, c.width * 0.7, y + (Math.random() - 0.5) * 22, c.width + 10, y);
    ctx.stroke();
  }

  // Потемнение по краям — доска на улице не первый год.
  const vig = ctx.createRadialGradient(c.width / 2, c.height / 2, 60, c.width / 2, c.height / 2, c.width * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40,26,12,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(46, 28, 14, 0.92)';
  // Длинные слова ужимаем, чтобы не вылезали за доску.
  const longest = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
  const size = Math.min(118, Math.floor((c.width * 0.86 * 1.85) / Math.max(longest.length, 1)));
  ctx.font = `bold ${size}px Georgia, serif`;
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-0.012);
  const step = size * 1.05;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * step);
  });
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Табличка на двух столбах: текст в одну-две строки, ставится куда скажут. */
export function buildSign(
  lines: string[],
  x: number,
  y: number,
  z: number,
  rotation: number,
): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1 });

  // Столбы стоят ЗА доской: вровень с ней они лезли поверх букв.
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.9, 6);
  for (const dx of [-0.88, 0.88]) {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set(dx, 0.95, -0.11);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }

  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.07), wood);
  board.position.set(0, 1.45, 0);
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.34, 0.96),
    new THREE.MeshStandardMaterial({ map: signTexture(lines), roughness: 1 }),
  );
  face.position.set(0, 1.45, 0.038);
  group.add(face);

  group.position.set(x, y, z);
  group.rotation.y = rotation;
  // Слегка перекошена: стоит не первый год.
  group.rotation.z = 0.02;
  group.name = 'sign';
  return group;
}
