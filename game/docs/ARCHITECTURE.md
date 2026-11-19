# Architecture

Engine: Godot 4.4.1, GDScript, mobile renderer. Native Android APK export, no WebView.

```
game/
  scenes/               main scene + runtime-generated UI/world roots
  scripts/core/         GameManager (state machine), SaveSystem (JSON user://),
                        EventBus (decoupled signals), QualitySettings
  scripts/player/       third-person controller, camera rig, stats, touch input
  scripts/vehicles/     VehicleBody3D wrapper, wheel physics, damage, spawner
  scripts/weapons/      hitscan/projectile weapons, recoil, effects, aim assist
  scripts/ai/           traffic, pedestrians, police, gangs, road graph
  scripts/world/        procedural city, chunk streamer, day/night, weather, road graph
  scripts/missions/     mission runner and 5 story definitions
  scripts/economy/      wallet, shops, properties, progression
  scripts/ui/           menu, HUD, minimap, phone, settings, localisation
  scripts/audio/        mixer, radio stations, engine audio
  tools/asset_pipeline/ deterministic Python generators (audio, textures, geometry)
  tests/                headless smoke tests run by CI before every APK build
```

Conventions: preloaded class references instead of `get_node()` lookups in hot paths,
signals on `EventBus` for cross-system messages, object pools for bullets/particles/traffic,
all data in typed Resources or const tables, no per-frame allocations in the hot loop.

State flow: `BOOT → SPLASH → MENU → (LOADING → PLAY) → PAUSE → MENU`.
`GameManager` owns the state and is the only scene-tree singleton that persists.
