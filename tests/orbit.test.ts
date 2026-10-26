import { describe, it, expect } from "vitest";
import { orbitPose } from "../src/lib/orbit";
describe("scroll orbit geometry", () => {
  it("starts in the existing orbit and assembles into actual rows", () => {
    expect(orbitPose(0, 0)).toMatchObject({
      x: -156,
      y: -46,
      z: 95,
      rotateY: -18,
      rotateZ: -13,
    });
    expect(orbitPose(0, 1)).toMatchObject({
      x: -151,
      y: -55,
      z: 0,
      rotateY: -40,
      rotateZ: 0,
      assembly: 1,
    });
  });
  it("moves even a single word across the scene through depth instead of shifting a few pixels", () => {
    const start = orbitPose(0, 0),
      middle = orbitPose(0, 0.45);
    expect(Math.abs(middle.x - start.x)).toBeGreaterThan(200);
    expect(orbitPose(0, 0.25).z).toBeGreaterThan(start.z);
    expect(orbitPose(0, 0.7).z).toBeLessThan(0);
  });
  it("reverses deterministically with scroll and keeps every card finite", () => {
    for (let i = 0; i < 6; i++)
      for (const p of [0, 0.25, 0.5, 0.75, 1, 0.5, 0]) {
        const pose = orbitPose(i, p);
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
        expect(orbitPose(i, p)).toEqual(pose);
      }
  });
});
