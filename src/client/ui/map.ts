import { MOUNTAIN, RIVER, WORLD } from '../../shared/balance';

import { Terrain } from '../../shared/world/terrain';

/**
 * Карта на клавишу M. Нарисована как купленная у местных бумажная схема:
 * рельеф отмывкой, вода, лес, подписи ориентиров. Игрока на ней нет — ты
 * примерно понимаешь, где что, а где ты сам — догадывайся.
 *
 * Растр считается один раз по тому же рельефу, что и мир, и кэшируется.
 */

/** Сторона растра карты в пикселях. */
const RASTER = 420;
/** Размер холста на экране. */
const SIZE = 720;

interface Landmark {
  x: number;
  z: number;
  label: string;
  /** Значок: рисуется поверх подложки. */
  kind: 'hut' | 'peak' | 'water' | 'bridge' | 'sign' | 'cave' | 'gorge';
}

/** Флажок, поставленный игроком молотом: на карте это красная метка. */
export interface MapFlag {
  x: number;
  z: number;
}

export class MapScreen {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly hintEl: HTMLDivElement;
  /** Отмывка рельефа: считается один раз и потом только копируется. */
  private relief: HTMLCanvasElement | null = null;

  private flags: MapFlag[] = [];
  private landmarks: Landmark[] = [];
  private closeHandler: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'mapscreen';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="map-panel">
        <div class="map-title">Круглое озеро и окрестности</div>
        <canvas class="map-canvas" width="${SIZE}" height="${SIZE}"></canvas>
        <div class="map-hint"></div>
      </div>`;
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector('.map-canvas')!;
    this.context = this.canvas.getContext('2d')!;
    this.hintEl = this.root.querySelector('.map-hint')!;

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(terrain: Terrain, landmarks: Landmark[], flags: MapFlag[], onClose: () => void): void {
    this.landmarks = landmarks;
    this.flags = flags;
    this.closeHandler = onClose;
    if (!this.relief) this.relief = buildRelief(terrain);
    this.hintEl.textContent =
      'Флажки ставятся молотом на месте. Пещеры и памятник появляются, когда их найдёшь. M или Esc — закрыть';
    this.draw();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    const onClose = this.closeHandler;
    this.closeHandler = null;
    onClose?.();
  }

  /** Мир → пиксели холста. */
  private toScreen(x: number, z: number): [number, number] {
    const half = WORLD.half;
    return [((x + half) / (half * 2)) * SIZE, ((z + half) / (half * 2)) * SIZE];
  }

    private draw(): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (this.relief) ctx.drawImage(this.relief, 0, 0, SIZE, SIZE);

    // Рамка и сетка вёрст поверх отмывки.
    ctx.strokeStyle = 'rgba(74, 58, 38, 0.28)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(SIZE, p);
      ctx.stroke();
    }

    ctx.font = '13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const landmark of this.landmarks) {
      const [x, y] = this.toScreen(landmark.x, landmark.z);
      drawLandmark(ctx, x, y, landmark.kind);
      ctx.fillStyle = '#3d2f1e';
      ctx.strokeStyle = 'rgba(240, 232, 210, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(landmark.label, x, y + 16);
      ctx.fillText(landmark.label, x, y + 16);
    }

    // Флажки игрока — поверх всего, красным.
    this.flags.forEach((flag, index) => {
      const [x, y] = this.toScreen(flag.x, flag.z);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 17);
      ctx.strokeStyle = '#7a2b1e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 17);
      ctx.lineTo(x + 12, y - 13);
      ctx.lineTo(x, y - 9);
      ctx.closePath();
      ctx.fillStyle = '#b8402c';
      ctx.fill();
      ctx.fillStyle = '#f0e8d2';
      ctx.font = '10px Georgia, serif';
      ctx.fillText(String(index + 1), x + 5, y - 13);
      ctx.font = '13px Georgia, serif';
    });
  }
}

/** Значок ориентира: у каждого свой, чтобы карта читалась без легенды. */
function drawLandmark(ctx: CanvasRenderingContext2D, x: number, y: number, kind: Landmark['kind']): void {
  ctx.save();
  ctx.strokeStyle = '#3d2f1e';
  ctx.fillStyle = '#3d2f1e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  switch (kind) {
    case 'hut':
      ctx.moveTo(x - 6, y + 4);
      ctx.lineTo(x - 6, y - 1);
      ctx.lineTo(x, y - 6);
      ctx.lineTo(x + 6, y - 1);
      ctx.lineTo(x + 6, y + 4);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'peak':
      ctx.moveTo(x - 8, y + 5);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 8, y + 5);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'bridge':
      ctx.moveTo(x - 8, y + 2);
      ctx.quadraticCurveTo(x, y - 8, x + 8, y + 2);
      ctx.stroke();
      break;
    case 'cave':
      ctx.arc(x, y + 3, 6, Math.PI, 0);
      ctx.stroke();
      break;
    case 'gorge':
      ctx.moveTo(x - 5, y - 6);
      ctx.lineTo(x - 2, y + 6);
      ctx.moveTo(x + 5, y - 6);
      ctx.lineTo(x + 2, y + 6);
      ctx.stroke();
      break;
    case 'water':
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x, y - 5);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 6, y - 3);
      ctx.lineTo(x, y - 1);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * Отмывка рельефа. Считается по тому же полю высот, что и мир, поэтому
 * карта не врёт: где на ней склон, там склон и в лесу.
 */
function buildRelief(terrain: Terrain): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = RASTER;
  canvas.height = RASTER;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(RASTER, RASTER);
  const data = image.data;
  const half = WORLD.half;
  const step = (half * 2) / RASTER;

  for (let py = 0; py < RASTER; py++) {
    const z = -half + py * step;
    for (let px = 0; px < RASTER; px++) {
      const x = -half + px * step;
      const h = terrain.height(x, z);
      const i = (py * RASTER + px) * 4;

      let r: number;
      let g: number;
      let b: number;

      const lake = Terrain.lakeDistance(x, z) < WORLD.lakeHalf && h < WORLD.waterLevel;
      const river = Terrain.riverDistance(x, z) < RIVER.halfWidth && h < RIVER.level;
      if (lake || river) {
        // Вода: чем глубже, тем синее.
        const depth = Math.min(((lake ? WORLD.waterLevel : RIVER.level) - h) / 3, 1);
        r = 150 - depth * 60;
        g = 178 - depth * 60;
        b = 196 - depth * 30;
      } else if (h < WORLD.shoreHeight + 0.1 && Terrain.lakeDistance(x, z) < WORLD.lakeHalf + 4) {
        r = 224;
        g = 209;
        b = 172;
      } else {
        // Суша: светлая бумага внизу, охра и коричневый на высоте. Корень
        // растягивает низы — иначе бугры теряются на общем фоне.
        // Верх шкалы — выше самой вершины: гора теперь стоит на холмах.
        const t = Math.sqrt(Math.min(Math.max(h / (MOUNTAIN.height * 1.6), 0), 1));
        r = 224 - t * 96;
        g = 210 - t * 112;
        b = 174 - t * 116;
        // Штриховка склонов: свет падает с северо-запада, тень — на юго-восток.
        const gx = terrain.height(x + step, z) - terrain.height(x - step, z);
        const gz = terrain.height(x, z + step) - terrain.height(x, z - step);
        const shade = Math.max(-1, Math.min(1, (gx + gz) * 0.55));
        r -= shade * 46;
        g -= shade * 44;
        b -= shade * 36;
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export type { Landmark };
