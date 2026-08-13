/**
 * Кого видят звери и мертвецы. В одиночной игре это один игрок, на сервере —
 * все, кто сейчас в лесу. Симуляции незачем знать про рюкзаки и дыхание: ей
 * хватает того, где человек стоит и куда смотрит.
 */
export interface Actor {
  id: number;
  x: number;
  z: number;
  yaw: number;
}

/** Ближайший к точке. null — в лесу вообще никого нет. */
export function nearestActor(actors: readonly Actor[], x: number, z: number): { actor: Actor; distance: number } | null {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const a of actors) {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best ? { actor: best, distance: bestD } : null;
}

/** Урон по игрокам за шаг: id → сколько прилетело. */
export type DamageMap = Map<number, number>;

export function addDamage(map: DamageMap, id: number, amount: number): void {
  if (amount <= 0) return;
  map.set(id, (map.get(id) ?? 0) + amount);
}
