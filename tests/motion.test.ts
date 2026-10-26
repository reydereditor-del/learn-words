import { describe, it, expect } from "vitest";
import { shouldReduceMotion } from "../src/lib/motion";
import { emptyData } from "../src/lib/types";
import {
  validateBackup,
  parseBackup,
  serializeBackup,
} from "../src/lib/storage";
describe("explicit motion choices", () => {
  it("respects OS reduced motion until the user makes an explicit choice", () => {
    expect(shouldReduceMotion({ reducedMotion: false }, true)).toBe(true);
    expect(shouldReduceMotion({ reducedMotion: false }, false)).toBe(false);
  });
  it("lets the user explicitly enable animation despite an OS reduction request", () => {
    expect(
      shouldReduceMotion(
        { reducedMotion: false, motionOverride: "full" },
        true,
      ),
    ).toBe(false);
  });
  it("still permits explicit and legacy reduced choices", () => {
    expect(
      shouldReduceMotion(
        { reducedMotion: false, motionOverride: "reduced" },
        false,
      ),
    ).toBe(true);
    expect(shouldReduceMotion({ reducedMotion: true }, false)).toBe(true);
  });
  it("preserves an explicit choice in backup and accepts old backups", () => {
    const data = emptyData();
    data.preferences.motionOverride = "full";
    expect(parseBackup(serializeBackup(data))).toEqual(data);
    expect(validateBackup(emptyData())).toEqual(emptyData());
  });
  it("rejects invalid motion choices rather than changing them silently", () => {
    const data = emptyData();
    Object.assign(data.preferences, { motionOverride: "invalid" });
    expect(() => validateBackup(data)).toThrow(/motionOverride/);
  });
});
