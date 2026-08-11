/** Разреженная сетка для поиска препятствий рядом с игроком. */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  /** Индекс дерева в WorldData.trees; -1 у всего остального. */
  id: number;
  /** Срубленное дерево перестаёт мешать, пока не отрастёт. */
  disabled?: boolean;
}

export class ObstacleGrid {
  private readonly cells = new Map<number, Obstacle[]>();

  constructor(private readonly cellSize = 6) {}

  private key(cx: number, cz: number): number {
    // Координаты сетки укладываются в 16 бит каждая — мира на 400 м хватает с запасом.
    return ((cx + 4096) << 13) | (cz + 4096);
  }

  add(o: Obstacle): void {
    const cx = Math.floor(o.x / this.cellSize);
    const cz = Math.floor(o.z / this.cellSize);
    const k = this.key(cx, cz);
    const list = this.cells.get(k);
    if (list) list.push(o);
    else this.cells.set(k, [o]);
  }

  /** Все препятствия в квадрате радиуса r вокруг точки. */
  query(x: number, z: number, r: number, out: Obstacle[] = []): Obstacle[] {
    out.length = 0;
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minZ = Math.floor((z - r) / this.cellSize);
    const maxZ = Math.floor((z + r) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) for (const o of list) out.push(o);
      }
    }
    return out;
  }
}
