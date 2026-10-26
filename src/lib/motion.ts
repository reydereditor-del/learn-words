import type { AppData } from "./types";

/** Follow the OS by default; an explicit choice in the app takes precedence. */
export function shouldReduceMotion(
  preferences: AppData["preferences"],
  systemReduced: boolean,
): boolean {
  if (preferences.motionOverride === "full") return false;
  if (preferences.motionOverride === "reduced") return true;
  return preferences.reducedMotion || systemReduced;
}
