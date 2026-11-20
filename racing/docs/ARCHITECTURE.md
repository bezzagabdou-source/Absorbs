# APEX VELOCITY — Architecture

Target: Godot 4.4.1 (Mobile/Vulkan renderer, GL Compatibility fallback), Android arm64,
1080p canvas + 3D render scaling, 60 fps target / 120 Hz present.

## Module map

```
racing/
  project.godot            # renderer, input map, autoloads, android export defaults
  export_presets.cfg       # Android (APK) preset, arm64-v8a
  scenes/Main.tscn         # single root scene; everything else is assembled in code
  scripts/
    autoload/
      Game.gd              # profile: coins, xp, level, cars, upgrades, paints, achievements
      SettingsStore.gd     # graphics/sound/controls/language; applied at boot
      Localization.gd      # EN / FR / AR (RTL aware), runtime string table
      AudioDirector.gd     # music player, SFX pool, engine synth voice, ducking
      SceneRouter.gd       # screen stack + transition shader + boot sequence
      GameData.gd          # static databases: 32 cars, 8 track configs, parts, achievements
      UIStyle.gd           # runtime Theme, palette, fonts, icon library, widget factory
    core/
      Driver.gd            # main state machine: splash->menu->garage->race->results
      ScreenshotRig.gd     # CI capture mode (--shoot): deterministic screen tour + PNG dump
    vehicle/
      CarModel.gd          # procedural car mesh builder (32 silhouettes, 5 rims, liveries)
      CarController.gd     # arcade-sim vehicle: engine, gearbox, tyres, drift, nitro, damage
      WheelVisual.gd       # wheel spin/steer/deflection
      CarAudio.gd          # RPM-driven engine synth + exhaust pops + tyre screech
    race/
      TrackBuilder.gd      # spline -> road/curb/barrier mesh, props, checkpoints
      TrackLibrary.gd      # 8 authored track layouts (city night, desert, mountain, coast...)
      EnvironmentRig.gd    # sky shader, fog, rain, time of day, post FX
      RaceDirector.gd      # laps, positions, countdown, modes (circuit/trial/drag), results
      RacerAI.gd           # spline follower with curvature speed model + overtaking
    fx/
      VFX.gd               # skidmarks, nitro flames, dust/rain splashes, speed lines
      ShakeRig.gd          # camera shake + speed FOV + drift camera
    ui/
      screens/*.gd         # Splash, MainMenu, Garage, Shop, TrackSelect, RaceHUD, Results,
                           # Settings, Achievements, DailyReward, Pause, Profile
      widgets/*.gd         # GlassPanel, NeonButton, StatBar, CarCard, Toggle, Slider, Tabs
  assets/                  # fonts (OFL), AI key art (WebP), synthesized audio (OGG), textures
  tests/                   # headless test-runner: data integrity, car/track scene load,
                           # vehicle physics assertions, save/load, localization coverage
  tools/                   # asset generators (python), CI helpers, license audit
```

## Rendering / performance

* Mobile renderer (Vulkan) with `gl_compatibility` fallback configured.
* One directional light + emissive road strips + up to 8 omni lights (Interior of city).
* Glow + tonemap ACES + adjustments (saturation/contrast) for the neon look.
* 3D rendered through a `SubViewport` at a configurable scale (0.6–1.0 of canvas) so that
  1440p phones keep 60 fps; UI stays sharp because it is drawn on the canvas layer.
* Procedural meshes cached per car archetype; `MultiMeshInstance3D` for props and crowd.
* Car LOD: high mesh < 60 m, simplified mesh beyond, mesh instance hidden > 220 m.
* All textures are generated (asphalt, tread, decals) at 512/1024 and mipmapped; no 4K maps.

## Save data

`user://profile.json` (ConfigFile-versioned JSON): credits, xp, owned cars + per-car upgrade
levels + paint/rim, achievements, daily streak, best laps per track, settings mirror.
Atomic write (temp file then rename) and corrupt-file quarantine.

## Layout invariants (learned the hard way)

These rules keep the UI from silently collapsing; every one of them cost a CI
round to discover.

* Any Control that must fill its parent uses
  `set_anchors_and_offsets_preset(PRESET_FULL_RECT)`. `set_anchors_preset()`
  alone only moves the anchors and leaves the size at its minimum, which
  collapses panels to the top-left.
* After a preset, set anchors explicitly if the preset is relative to the wrong
  edge (`PRESET_RIGHT_WIDE` on a panel that must span the middle of the canvas
  ends up off-screen once a sibling changes the rect).
* Title-sized numerals use the Rajdhani numeric face (`UIStyle.make_numeral`).
  Orbitron draws zero as a slashed box, which reads as a missing glyph in QA.
* `look_at()` / `look_at_from_position()` require the node to already be in the
  tree; otherwise the rotation silently stays identity. Add the child first.
* `Basis.looking_at()` is a camera basis (forward is `-Z`). For meshes and
  colliders use `rotation.y = atan2(dir.x, dir.z)`.
* `MultiMesh.use_colors` must be enabled **before** `instance_count`, otherwise
  the instance colours are rejected and the props render white.
* A `SubViewportContainer` with `stretch = true` squashes the render target to
  the container. Either size the `SubViewport` to the container each frame or
  derive the camera FOV from the on-screen stage ratio.

## CI

`.github/workflows/apex-velocity.yml` has three jobs:

1. **verify** — gdparse + gdlint, `physics_sim.py`, `godot --import` (fails on
   any SCRIPT ERROR), then the headless test suite.
2. **build** — generates a throwaway keystore, imports, exports the release APK,
   validates it with `aapt2` + `apksigner` + the size/content gate, uploads the
   artifact and publishes a Release on any `v*` tag.
3. **screenshots** — renders ten screens under Xvfb at 1920x1080, dumps a layout
   diagnostics log, and commits both back to the branch. Non-blocking: it runs
   with `continue-on-error` so a software-GL hiccup can never block a build.
