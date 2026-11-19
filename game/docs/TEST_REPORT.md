# Test report

Updated by CI and by manual inspection. No result is claimed before it is produced.

## Environment
- Local: no Godot/SDK/JDK; validation is delegated to GitHub Actions `ubuntu-latest`.
- CI: Godot 4.4.1-stable headless, OpenJDK 17, Android SDK via `android-actions/setup-android`.

## Automated checks
| Check | Status | Evidence |
| --- | --- | --- |
| Project import / script parse | PASS | Actions run `44539099136`, job `verify` (23 s) |
| Headless gameplay smoke test (24 script parses, save roundtrip, road graph, city chunks, 9 missions, all managers boot) | PASS | Actions run `44539099136`, `tests/smoke_test.gd` |
| APK export + signature verification (`aapt dump badging`, `apksigner verify --print-certs`) | PASS | Actions run `44539099136`, job `build` (52 s) |
| Release upload | PASS | Release `v0.1.0`, asset `NovaMira-v0.1.0.apk` |
| APK installable on real device | NOT TESTED — no device/emulator in sandbox | see KNOWN_LIMITATIONS |

## Release artefact (measured, not estimated)

| Item | Value |
| --- | --- |
| APK file | `NovaMira-v0.1.0.apk` |
| Size | 26,058,026 bytes (24.84 MiB) |
| Extra data files | none (no OBB, no AssetBundles) |
| Package | `com.novamira.game` |
| Version | 0.1.0 (code 1) |
| Target | Android / ARM64, min API 26 |
| Signature | release keystore generated in CI, verified with `apksigner` |
| Download | https://github.com/bezzagabdou-source/Absorbs/releases/download/v0.1.0/NovaMira-v0.1.0.apk |

## What the smoke test actually exercises

The CI harness parses every GDScript file, writes and reads an encrypted JSON save,
builds the 441-node road graph, asserts the data tables (6 districts / 10 vehicles /
8 weapons / 9 missions), instantiates the real main scene, boots all systems and
checks that generated city chunks exist. Any `SCRIPT ERROR` in the log fails the job.

## Known test noise (not functional failures)

Godot's headless test process reports a few font/shaped-text RID leaks at shutdown.
They are engine-side caches released by process exit and do not occur as gameplay
errors; the smoke test exits with code 0 after all assertions pass.

## Measured runtime performance
Not measured on hardware. Runtime budgets are enforced by design (chunk radius,
traffic caps, multi-mesh instancing, 30 fps default), not by a claimed benchmark.

## Release checklist
- [x] No commercial/copied assets; licences documented
- [x] Import + smoke test green in CI
- [x] APK produced and signed
- [x] Release uploaded with direct download URL
- [ ] On-device 15-minute soak test / FPS measurement (hardware unavailable)
