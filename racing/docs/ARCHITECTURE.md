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
