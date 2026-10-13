"use client";

import { useEffect } from "react";

/**
 * Keeps the app frame glued to the visible screen.
 *  - blocks pinch / double-tap zoom,
 *  - writes the visible height + top offset in ONE batched frame, only when the
 *    numbers really changed (no feedback loops, no scrollTo fights, no jitter).
 */
export function StableViewport() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    window.addEventListener("wheel", onWheel, { passive: false });

    const root = document.documentElement;
    const vv = window.visualViewport;
    let raf = 0;
    let lastH = -1;
    let lastTop = -1;

    const apply = () => {
      raf = 0;
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const top = Math.max(0, Math.round(vv ? vv.offsetTop : 0));
      if (h !== lastH) {
        lastH = h;
        root.style.setProperty("--app-h", `${h}px`);
      }
      if (top !== lastTop) {
        lastTop = top;
        root.style.setProperty("--app-top", `${top}px`);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    // Pause the ambient background animations while the screen is moving (scroll, touch drag,
    // keyboard opening / rotation). Animated full-screen layers repainted on every frame during a
    // scroll — that is the "screen glitch" people saw. They resume ~180 ms after the movement stops.
    let moveTimer = 0;
    const markMoving = () => {
      if (!root.classList.contains("is-moving")) root.classList.add("is-moving");
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => root.classList.remove("is-moving"), 180);
    };
    const movingOpts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("scroll", markMoving, movingOpts);
    window.addEventListener("touchmove", markMoving, movingOpts);
    window.addEventListener("wheel", markMoving, movingOpts);
    window.addEventListener("resize", markMoving);

    apply();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      window.removeEventListener("wheel", onWheel);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", markMoving, movingOpts);
      window.removeEventListener("touchmove", markMoving, movingOpts);
      window.removeEventListener("wheel", markMoving, movingOpts);
      window.removeEventListener("resize", markMoving);
      window.clearTimeout(moveTimer);
      root.classList.remove("is-moving");
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
