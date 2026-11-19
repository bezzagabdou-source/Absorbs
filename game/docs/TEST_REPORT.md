# Test report

Updated by CI and by manual inspection. No result is claimed before it is produced.

## Environment
- Local: no Godot/SDK/JDK; validation is delegated to GitHub Actions `ubuntu-latest`.
- CI: Godot 4.4.1-stable headless, OpenJDK 17, Android SDK via `android-actions/setup-android`.

## Automated checks
| Check | Status | Evidence |
| --- | --- | --- |
| Project import / script parse | pending first CI run | workflow `build-android.yml` job `verify` |
| Headless gameplay smoke test (managers, save, economy, wanted, weapons, world seed) | pending first CI run | `tests/smoke_test.gd` |
| APK export + signature | pending first CI run | workflow `build-android.yml` job `build` |
| APK installable on real device | not tested — no device/emulator in sandbox | see KNOWN_LIMITATIONS |

## Measured runtime performance
Not measured on hardware. Runtime budgets are enforced by design (chunk radius,
traffic caps, multi-mesh instancing, 30 fps default), not by a claimed benchmark.

## Release checklist
- [x] No commercial/copied assets; licences documented
- [ ] Import + smoke test green in CI
- [ ] APK produced and signed
- [ ] Release uploaded with direct download URL
