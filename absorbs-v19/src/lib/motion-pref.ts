/**
 * v18 setting: "تقليل الحركة" — turns off the decorative loops (signal bars, orb, sheen, aurora).
 * Stored on this device only. Applied as <html data-motion="reduced"> and styled in globals.css.
 */
export const MOTION_KEY = "nx_reduce_motion";

export function getMotionPref(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

export function applyMotionPref(on: boolean = getMotionPref()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = on ? "reduced" : "";
}

export function setMotionPref(on: boolean): void {
  try {
    localStorage.setItem(MOTION_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  applyMotionPref(on);
}
