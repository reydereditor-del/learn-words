const positions = [
  { x: -156, y: -46, z: 95, r: -13 },
  { x: 95, y: -128, z: -20, r: 12 },
  { x: 194, y: 26, z: 45, r: 17 },
  { x: 1, y: 132, z: 110, r: -5 },
  { x: -229, y: 105, z: -70, r: -19 },
  { x: -56, y: -174, z: -110, r: 8 },
];

/** Scroll rotates positions through real depth before bringing them into rows. */
export function orbitPose(index: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const pos = positions[index];
  const angle = p * Math.PI * 1.4;
  const gather = Math.max(0, (p - 0.55) / 0.45);
  const blend = gather * gather * (3 - 2 * gather);
  return {
    x:
      (pos.x * Math.cos(angle) + pos.z * Math.sin(angle)) * (1 - blend) +
      ((index % 3) - 1) * 151 * blend,
    y:
      (pos.y + (Math.sin(angle + index * 0.8) - Math.sin(index * 0.8)) * 22) *
        (1 - blend) +
      (Math.floor(index / 3) - 0.5) * 110 * blend,
    z:
      blend === 1
        ? 0
        : (-pos.x * Math.sin(angle) + pos.z * Math.cos(angle)) * (1 - blend),
    rotateY: (-18 + index * 8 + Math.sin(angle) * 25) * (1 - blend) - 40 * p,
    rotateZ: blend === 1 ? 0 : pos.r * (1 - blend),
    assembly: blend,
  };
}

/** Time-based damping fills the gaps between coarse mouse-wheel events. */
export function smoothOrbitProgress(
  current: number,
  target: number,
  elapsedMs: number,
): number {
  const destination = Math.max(0, Math.min(1, target));
  const next =
    current +
    (destination - current) *
      (1 - Math.exp(-Math.max(0, Math.min(64, elapsedMs)) / 85));
  return Math.abs(destination - next) < 0.0001 ? destination : next;
}
