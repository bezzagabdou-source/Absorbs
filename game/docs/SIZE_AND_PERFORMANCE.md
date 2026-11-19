# Size and performance dashboard — Phase 1

All numbers below are measured in GitHub Actions unless explicitly marked as a
target. No phone FPS figure is claimed without a device.

## Size budget

| Item | Phase 1 measured | Limit | Status |
| --- | ---: | ---: | --- |
| APK (ARM64, signed, no OBB) | 26,088,571 B (24.88 MiB) | 200,000,000 B | PASS |
| Generated original WAV audio | ~0.7 MB | 20 MB | PASS |
| OFL fonts (Noto Sans Arabic) | ~0.5 MB | 10 MB | PASS |
| Generated original PNG textures | <0.1 MB | 10 MB | PASS |
| Runtime procedural geometry | 0 B packaged | — | PASS |
| Extra data files (OBB/PAD) | 0 B | 0 B | PASS |

CI hard gate: `python3 game/tools/check_apk_size.py build/NovaMira-v0.1.0.apk`
exits non-zero above 200 MB and prints `APK_SIZE_BYTES` for the run annotation.

## Quality tiers (recommended device class, not a claim of measured FPS)

| Tier | Render scale | Target refresh | Shadows | Bloom | SSAO/SSR | Volumetric/motion blur | Memory ceiling |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
| Low | 0.70 | 30 fps @ 720p | off | off | off | off | 800 MB |
| Medium | 1.00 | 60 fps @ 1080p | on | on | off | off | 1100 MB |
| High | 1.00 | 90 fps | on | on | on | off | 1400 MB |
| Ultra | 1.50 | 120 fps | on | on | on | on | 1500 MB |

User override: resolution-scale slider 50%–150%, Ultra enables supersampling.
Auto-selection resolver: `<=8.3 ms Ultra, <=12 ms High, <=18 ms Medium, else Low`
from a CPU/GPU frame-time benchmark, overridable in settings. Every heavy effect
has an off switch.

## Frame and memory budget

| Metric | Target | Current evidence |
| --- | --- | --- |
| Frame budget at 60 fps | <=16.6 ms CI benchmark threshold | foundation benchmark test PASS (headless, not a phone) |
| Static memory ceiling | 800 MB Low / 1500 MB High | enforced by tier configuration; real-device RSS untested |
| Streaming | chunked, off the input/render hot path | 21 city chunks, 441 road nodes in smoke test |
| Main-thread stalls | no blocking asset loads on the hot path | procedural generation is chunked; no on-device profile yet |

## Screenshot capture evidence

Five PNGs under `screenshots/` were rendered from the actual game scene in CI run
`44560909127`: main menu, daytime gameplay, night/rain gameplay, phone UI and
debug overlay. Size 960x540 each. They are viewable on iPhone as images; they are
not an iOS build or a WebGL preview.
