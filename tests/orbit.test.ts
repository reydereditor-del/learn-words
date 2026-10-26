import { describe, it, expect } from "vitest";
import { orbitPose, smoothOrbitProgress } from "../src/lib/orbit";
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

describe("frame-based scroll smoothing", () => {
  it("interpolates forward and backward without overshoot", () => {
    expect(smoothOrbitProgress(0, 1, 16)).toBeGreaterThan(0);
    expect(smoothOrbitProgress(0, 1, 16)).toBeLessThan(0.3);
    expect(smoothOrbitProgress(0.8, 0, 16)).toBeGreaterThan(0);
    expect(smoothOrbitProgress(0.8, 0, 16)).toBeLessThan(0.8);
  });
  it("uses elapsed time rather than assuming a particular display refresh rate", () => {
    let a = 0,
      b = 0;
    for (let i = 0; i < 10; i++) a = smoothOrbitProgress(a, 1, 16);
    for (let i = 0; i < 20; i++) b = smoothOrbitProgress(b, 1, 8);
    expect(a).toBeCloseTo(b, 10);
  });
  it("settles exactly so the animation loop can stop when scrolling stops", () => {
    let p = 0;
    for (let i = 0; i < 100; i++) p = smoothOrbitProgress(p, 1, 16);
    expect(p).toBe(1);
    for (let i = 0; i < 100; i++) p = smoothOrbitProgress(p, 0, 16);
    expect(p).toBe(0);
  });
});
