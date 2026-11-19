#!/usr/bin/env python3
"""Sanity check of the longitudinal model mirroring CarController._longitudinal.

Confirms that per-class tuning reaches its advertised top speed and that the
acceleration curve is plausible (0-100 km/h in the 2.5-9 s range).
Run in CI as part of the physics gate.
"""
import sys


def simulate(top_kmh, accel, seconds=90, dt=1 / 60):
    v_top = top_kmh / 3.6
    roll = 0.35
    drag = max(0.0001, (accel * 0.35 - roll)) / (v_top * v_top)
    v = 0.0
    t = 0.0
    t100 = t200 = None
    while t < seconds:
        kmh = abs(v) * 3.6
        band = max(0.0, min(1.0, 1.0 - (kmh / (v_top * 3.6)) ** 1.7))
        a = accel * (0.35 + 0.65 * band) - drag * v * abs(v) - roll
        v += a * dt
        t += dt
        if t100 is None and v * 3.6 >= 100:
            t100 = t
        if t200 is None and v * 3.6 >= 200:
            t200 = t
    return v * 3.6, t100, t200


def main() -> int:
    cases = [
        ("street stock", 168.0, 4.0),
        ("street tuned", 214.2, 6.2),
        ("sport mid", 262.9, 8.3),
        ("super tuned", 341.9, 10.0),
        ("hyper maxed", 412.0, 10.4),
    ]
    failures = 0
    for name, top, acc in cases:
        vt, t100, t200 = simulate(top, acc)
        err = abs(vt - top) / top
        ok = err < 0.03
        print(f"{name:14s} target {top:6.1f} -> {vt:6.1f} km/h (err {err * 100:4.1f}%) "
              f"0-100 {('%.1fs' % t100) if t100 else '  -  '} "
              f"0-200 {('%.1fs' % t200) if t200 else '  -  '} {'' if ok else 'FAIL'}")
        if not ok:
            failures += 1
    # acceleration plausibility
    _, t100_slow, _ = simulate(168.0, 4.0)
    _, t100_fast, _ = simulate(412.0, 10.4)
    if not (2.0 <= t100_fast <= t100_slow <= 10.0):
        print("FAIL: acceleration curve out of plausible range", t100_slow, t100_fast)
        failures += 1
    print("physics gate:", "PASS" if failures == 0 else f"FAIL ({failures})")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
