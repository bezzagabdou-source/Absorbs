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

## Rendering / performance (v2.0 overhaul)

### Custom shader stack

Four hand-written shaders carry the whole look. All are `gl_compatibility`-safe
because that is what the shipping APK uses (Vulkan `mobile` is available on
desktop builds only).

| File | Stage | What it does | Gotchas encoded in it |
|---|---|---|---|
| `shaders/car_paint.gdshader` | spatial | multilayer paint: base coat, lacquer Fresnel, panel AO, rim light | **no `CLEARCOAT`/`CLEARCOAT_GLOSS`** (spatial-only, fails to compile on compatibility); no per-pixel flake hash (one hash cell changes every pixel on a curved body => white noise) |
| `shaders/road.gdshader` | spatial | triplanar asphalt, lane paint, puddles, animated neon streaks | has a moonlit ambient term so the road is not a black void between the lines |
| `shaders/terrain.gdshader` | spatial | slope/height blend of grass/rock/sand/snow, macro biome patches | `NORMAL` arrives **already in world space** — transforming it by `MODEL_MATRIX` again double-applies rotation and flattens the lighting |
| `shaders/post_fx.gdshader` | canvas_item | ACES, grade, vignette, aberration, bloom bleed, anamorphic flare, speed zoom, damage flash, grain | takes the 3D viewport as a plain `sampler2D`, **not** `hint_screen_texture` (the canvas under the car is empty) |

### World + vehicle

* `race/OpenWorld.gd` — 2.4 km × 2.4 km region, ring highway, landmarks,
  instanced scatter, roadside lamp posts and a horizon skyline. Grid and prop
  counts drop automatically on software rasterisers.
* `vehicle/CarModel.gd` — one lofted shell per body shape (26 stations × 28
  segment superellipse), glasshouse, arches, aero, forged rims, layered lights.
  The loft is authored counter-clockwise in XY with stations advancing along +Z;
  the quad winding must be `(v0, v1, v3, v2)` or the shell faces inward and
  `cull_back` deletes it.

### Frame-rate design

* Race 3D goes through a `SubViewport` at 0.6–1.0 render scale, UI is drawn on
  the canvas.
* No SSAO / SSIL / SSR / SDFGI / volumetric fog: none are available on the
  compatibility backend anyway.
* One shadow-casting directional light (2 splits, 160 m); lamps and neon are
  unshadowed emissive geometry.
* `run/max_fps=120` in `project.godot`; physics stays a fixed 60 Hz tick so
  handling is identical on every device while rendering may run at 120.
* **`autoload/PerfGovernor.gd`** measures real frame time and moves between four
  quality steps (ULTRA / HIGH / BALANCED / PERFORMANCE), changing terrain mesh
  density, shadow distance and glow. It acts only on a sustained miss, at most once
  every 4 s, so a loading hitch never drops the world's detail. The measured rate
  and current tier are shown on the HUD behind the `show_fps` setting — the number
  is there to be checked, not asserted.
* Quality tiers drive render scale, shadow atlas, MSAA, screen-space AA and
  anisotropic filtering (`SettingsStore._apply_quality`).

* Mobile renderer (Vulkan) with `gl_compatibility` fallback configured.
* One directional light + emissive road strips + up to 8 omni lights (Interior of city).
* Glow + tonemap ACES + adjustments (saturation/contrast) for the neon look.
* 3D rendered through a `SubViewport` at a configurable scale (0.6–1.0 of canvas) so that
  1440p phones keep 60 fps; UI stays sharp because it is drawn on the canvas layer.
* Procedural meshes cached per car archetype; `MultiMeshInstance3D` for props and crowd.
* Car LOD: high mesh < 60 m, simplified mesh beyond, mesh instance hidden > 220 m.
* All textures are generated (asphalt, tread, decals) at 512/1024 and mipmapped; no 4K maps.

### The highway

The carriageway is **painted into `shaders/terrain.gdshader`**, not a separate
ribbon mesh. The shader re-evaluates the same ring function the collider uses
(`r = 620·(1 + 0.10·sin 3θ + 0.05·cos 5θ)`) and derives lane dashes, a double centre
line, edge lines and cyan kerbs analytically from the signed radial distance. This
makes the classic occlusion failure — a decal or strip mesh z-fighting with, or
sinking under, the ground — impossible by construction. `OpenWorld.gd` sets
`road_ring_radius`, `road_half_width` and `road_shoulder` before the material is
compiled for the first time.

Two static gates exist because a shader that fails to compile silently falls back
to a default material, which in a screenshot is indistinguishable from a geometry
bug:

* `tools/check_shaders.py` — rejects mutable file-scope declarations.
* `tools/check_shader_ids.py` — reports identifiers used but never declared.

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
