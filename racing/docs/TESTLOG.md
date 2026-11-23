# APEX VELOCITY — Test Log

Every claim in this file comes from an actual CI run on GitHub Actions
(`.github/workflows/apex-velocity.yml`). There is no local Godot binary in the
authoring sandbox, so CI is the only execution environment — anything not
covered by a green CI step is listed under **Not verified** at the bottom.

Format: **what was tested → result → what was fixed**.

---

## Test harness

| Layer | Tool | What it proves |
|---|---|---|
| Static parse | `gdparse` (gdtoolkit) | every `.gd` is syntactically valid |
| Style | `gdlint` + `racing/.gdlintrc` | naming, length, dead-code rules |
| Real compile | `godot --headless --import` | every script compiles with autoloads present |
| Physics gate | `tools/physics_sim.py` | 5 car classes reach target top speed / 0-100 |
| Unit + runtime | `res://tests/TestRunner.tscn` | data, physics, tracks, all 7 car bodies, 10 screens, **all 8 tracks raced headlessly** |
| Visual | Xvfb + `--write-movie` | screenshots of every screen committed to `docs/screenshots/` |
| Packaging | `aapt2 dump badging`, `apksigner verify`, `check_apk_size.py` | APK is signed, valid, within the 200 MB budget |

---

## Round 1 — first push (`44620477776`)

**Failed:** import errored on `UIStyle.gd` / `AudioDirector.gd`:
`Cannot infer the type of "p" variable … "path" variable`.

**Cause:** Godot 4 refuses `:=` inference from a `Variant` (the result of
`%`, `.get()`, dictionary indexing). `gdparse` accepts this, Godot does not.

**Fix:** removed `:=` in favour of explicit types across all 21 scripts;
every remaining inferred local now has a concrete type.

## Round 2 — `44620961605`

**Failed:** `Cannot infer the type of "ab"/"t"`, `Cannot assign a new value to
a constant` (`Game.gd`), `straight` / `local` in `AIDriver`.

**Fix:** typed those locals; converted the remainder of `:=` to `=` with
explicit declarations; `AIDriver` locals annotated.

## Round 3 — `44621325866`

**Failed:** `Too many arguments for "stop_race_audio()"`, `Member "position"
redefined (original in native class 'Control')` in `race.gd`, `Value of type
"VBoxContainer" cannot be assigned to a variable of type "HBoxContainer"`,
`Cannot assign a new value to a constant` in `AIDriver`.

**Fix:** `stop_race_audio(fade)` gained a real crossfade implementation;
`race.gd` renamed its `position` member to `car_position` (HUD label still
reads `POSITION`); garage paint/rim rows switched to `VBoxContainer`;
`AIDriver` members explicitly typed.

## Round 4 — `44621731987`

**Failed:** `Cannot find member "PRESET_BOTTOM_CENTER"` and
`PRESET_TOP_CENTER` (not real Godot enum names), `Too many arguments for
"go()"`.

**Fix:** `PRESET_CENTER_BOTTOM` / `PRESET_CENTER_TOP`; `ScreenBase.go()` now
takes `push_history`.

## Round 5 — `44622219859`

**Failed:** `res://tests/foundation_test.gd` — `Identifier not found:
GameData` (a `--script` SceneTree has **no autoloads**).

**Fix:** replaced the two `--script` tests with one scene-based
`tests/TestRunner.tscn` that boots the real project (autoloads alive).

## Round 6 — `44623224500`

**Failed (real runtime bugs found):**
* `Invalid call. Nonexistent function 'set_vertex' in base 'SurfaceTool'` —
  car body / glasshouse / road / kerb / barrier meshes were **never built**.
  `SurfaceTool`'s method is `add_vertex()`.
* `Invalid assignment of property 'modulate' … on MeshInstance3D` — nitro
  flames.
* `[TEST] FAIL boot -> menu` (frame-count based wait too short).

**Fix:** `set_vertex` → `add_vertex` in `CarModel.gd` and `TrackBuilder.gd`
(8 call sites), removed the invalid `modulate`, boot test waits on a timer.

## Round 7 — `44623825080`

**Failed:** `Invalid access to property or key 'label' on a base object of
type 'Dictionary'` in `garage.gd` / `shop.gd`, then `p_child is null`.

**Fix:** `GameData.CLASS_INFO` gained a display `label` ("Street", "Sport", …)
alongside the uppercase `name`, so both the chips and the long-form texts read
correctly.

## Round 8 — `44624455057`

**Failed:** `not all arguments converted during string formatting` in
`Localization.trf`, `Can't set instance color on a Multimesh that isn't using
colors`, `FSR1 is only available when using the Forward+ renderer`.

**Fix:** `trf()` returns the raw string when the key has no placeholder and
handles single-argument arrays; `em.use_colors = true` before
`set_instance_color`; FSR scaling now only applied when the renderer is not
`gl_compatibility`; `profile.next_level` gained a real `%d`.

## Round 9 — `44625108438` / `44625737780` — **PASS**

* `Lint + import + headless tests` — **success**
* `Render screenshots (software GL)` — **success** (every screen rendered)
* `Export signed APK` — export itself **succeeded**; the *size gate* step
  failed only because the workflow called `tools/check_apk_size.py` from the
  repository root while the script lives in `racing/tools/`.

**Fix:** corrected the path, made the APK content check tolerant of Godot's
packed layout, and added screenshot commit-back so the images are reviewable.

---

## Round 10 — layout repair (visual QA loop)

Screenshots committed by CI showed usable rendering but the canvas was a 1:1
crop of a 1920x1080 layout in a smaller window, and the hero art was absent.

1. **`window/size/window_width_override=1280` + `canvas_items` stretch** made
   the 1080p layout crop instead of scale. Removed the overrides.
2. `common.level` was missing from the string tables (UI showed the raw key).
   Added for en/fr/ar.
3. **Real layout bug:** ~76 controls used `set_anchors_preset()` without
   offsets, so panels collapsed to their minimum size and ignored the
   anchors. Replaced every call with `set_anchors_and_offsets_preset()`.
4. Screenshot capture raised to 1920x1080, race screen included, and each run
   is wrapped in a hard 120 s timeout because the software GL driver
   occasionally hangs under Xvfb.

## Round 11 — visual QA on real 1080p frames

Each round below was driven by looking at the PNG the CI committed, fixing the
defect, and re-running.

| # | Symptom seen in the capture | Root cause | Fix |
|---|---|---|---|
| 1 | Content squeezed into the left ~500 px | `set_anchors_preset()` without offsets leaves size at minimum | switched all 76 call sites to `set_anchors_and_offsets_preset()` |
| 2 | Track cards all shared one image | data says `city_night`, files are `track_city_night.webp` | loader falls back to the `track_` prefix |
| 3 | Card titles washed out by the art | gradient overlay + `KEEP_ASPECT_COVERED` fighting the caption | rebuilt the card as art block + caption block |
| 4 | Garage car cropped, orbit ring under the list | narrow `SubViewport` + vertical FOV | `KEEP_WIDTH`, stage between panels, wider orbit |
| 5 | Zeroes rendered as empty boxes | Orbitron's slashed zero is part of the typeface, not a missing glyph | all numerals use the Rajdhani numeric face (`UIStyle.make_numeral`) |
| 6 | Settings right pane blank | `PRESET_RIGHT_WIDE` overwritten after `LEFT_WIDE` pushed it off-canvas | explicit `anchor_left = 0.5` + offsets |
| 7 | Menu showcase car invisible | `Camera3D.look_at()` before the node was in the tree leaves an identity basis | add to tree, then position + `look_at` |
| 8 | Showcase car stretched wide | viewport aspect did not match the on-screen stage | stage-sized viewport + FOV derived from the stage ratio |
| 9 | Race HUD speedometer clipped at the right edge | inner `VBox` used `PRESET_CENTER` inside a fixed box | `PRESET_FULL_RECT` |
| 10 | Countdown digit stuck to the top edge | title label defaulted to top alignment | `vertical_alignment = CENTER` |
| 11 | Road colliders rotated like cameras | `Basis.looking_at()` is a camera basis (-Z forward) | `rotation.y = atan2(fwd.x, fwd.z)` |
| 12 | `Can't set instance color ... use_colors` spam | colours enabled after `instance_count` | `use_colors = true` set first |
| 13 | `Node not inside tree. Use look_at_from_position()` | sun aimed before being added | `add_child` then `look_at` |

Also fixed: FSR guard compared the wrong project setting key; credits text did
not wrap and overflowed the panel; achievements summary panels were sized for
content they didn't have.

**Artifact:** release `v1.0.6`, `APEX-VELOCITY.apk`, 47,391,592 bytes, signed
and size-gated in CI (`APK_SIZE_BYTES` notice on the verifying run).

## Round 12 — v2.0 graphics overhaul

This round replaced the whole rendering stack, so the failure modes were new
kinds of failure: GLSL that compiles in my head but not on the driver.

| # | What CI reported | Root cause | Fix |
|---|---|---|---|
| 14 | `SCRIPT ERROR: Invalid assignment of property 'multimesh' … on a base object of type 'MeshInstance3D'` at `OpenWorld.gd:326/372` | trees and rocks used `MeshInstance3D` for instanced scatter | `MultiMeshInstance3D` |
| 15 | `SCRIPT ERROR: Cannot call method 'add_child' on a null value` at `boot.gd:34` | the intro screen overrode `ScreenBase._build_backdrop()`, which runs **before** `content` exists | renamed the override to `_build_intro_backdrop()` and call it from `build()` |
| 16 | `SHADER ERROR: Unknown identifier in expression: 'CLEARCOAT_GLOSS'` | `CLEARCOAT` / `CLEARCOAT_GLOSS` are spatial-renderer only; the project ships `gl_compatibility` | faked the lacquer layer with a Fresnel sheen + roughness blend toward `clearcoat_roughness` |
| 17 | `NORMAL_MAP` written with no normal texture | also unsupported in the compatibility backend | removed the write; the perturbed `NORMAL` already does the work |
| 18 | Screenshot job: `step timed out after 8 minutes` | 40k-triangle terrain + full scatter under llvmpipe | `OpenWorld` detects `llvmpipe`/server feature and drops to a 96² grid and ~220 props; per-screen 75 s budget in the loop |

**Design bug caught while reading the code (not by CI):** the post-FX
`ColorRect` sampled `hint_screen_texture`, but it was added *under* the
`SubViewportContainer` in tree order, so it would have read an empty 2D frame.
Rewrote it to take `scene_tex` as a plain sampler fed from
`viewport.get_texture()`, and moved it last in the tree.

New in the suite: `tests/ShaderProbe.tscn` — parses every custom shader, checks
that all uniforms declared are non-empty, and attaches each `ShaderMaterial` to
a live `ColorRect` so the render server actually compiles it. Before this, a
broken shader only produced a warning and shipped.

## Round 13 — v2.0 visual QA on real captures (9 iterations)

Every entry below was *seen* in a committed screenshot, diagnosed, fixed and
re-captured. This is the loop that turned the first v2 build from "renders" into
"looks like a game".

| # | Symptom in the capture | Root cause | Fix |
|---|---|---|---|
| 19 | Car body shattered into white triangle noise | loft stitching used `(v0,v2,v1)` for every cell, so each quad emitted one inward and one outward triangle; `cull_back` deleted half the shell | `_add_quad(v0,v1,v3,v2)` — verified numerically before committing |
| 20 | Car paint blown out to pure white | `METALLIC = 1.0` + 3.4-energy key light + ACES = a mirror of the sun | metallic halved, key lowered to 1.5, three-point rig |
| 21 | `roam.png` byte-identical to `boot.png` | the CLI screen whitelist had no `"roam"`, so the flag was silently rejected; every capture was the boot screen | added `roam` + explicit race-in-roam routing |
| 22 | Boot screen showed a doubled wordmark | the hero art already contains VELOCITY, and a second one was drawn on top | art scaled 2.05x and offset so its wordmark leaves frame; type drawn once |
| 23 | `VELOCITY` clipped at the title edge | 108 px display face needs ~690 px, block was 640 px | 92 px + 760 px block |
| 24 | Whole open world pitch black | metro terrain albedo was 0.07 and the only light was a 0.28-energy moon | albedo 0.19-0.27, sky-driven bounce uniform, moon to 0.62 energy |
| 25 | Black wedge cutting across the highway | `OpenWorld._quad()` emitted `(a,b,c)+(a,c,d)`; the first triangle faced **down** | `(a,c,b)+(b,c,d)`; TrackBuilder already had the right pairing |
| 26 | Terrain and road both crushed to black | ACES applied twice — once by `Environment`, again at the end of `post_fx` | post shader only clamps |
| 27 | Long hard shadow bands over the map | night `sun_dir` had y=0.28 (16 deg above horizon) so 20 m hills threw 90 m shadows | moon raised to y=0.92 |

New static gate: `tools/check_undeclared.py`. `gdparse` accepts
`marker.position = centre` after `var centre` is deleted; the gate resolves
declarations per file plus its `extends "res://..."` chain and fails CI on
exactly that bug, which it was validated against by re-injecting it.

## Round 14 — the open world rendered without a floor

Reported symptom: the free-roam capture showed sky under the car and no highway,
in every configuration, while `race` and `tracks` looked correct. Four separate
defects were stacked on top of each other; each one alone was enough to hide the
road, and only instrumented captures separated them.

| # | Defect | Evidence | Fix |
|---|--------|----------|-----|
| 1 | **Terrain wound inside-out** (`p0,p2,p1` ⇒ rendered normal −Y) | Pseudo-colour capture: green only appeared on far ridges, and the near half of the frame was *sky*, not ground | `p0,p1,p2` / `p1,p3,p2`; `terrain faces up` test |
| 2 | **Carve and carriageway read different height profiles** | `road above terrain` test failed in all four regions after fix 1 made the ground visible | One `_smooth_ring_height()` source of truth; `height_at()` and the road both read it |
| 3 | **Road aliased a 22 m noise octave** at 20 m sampling vs. a 25 m grid | Algebraic check: the two surfaces could differ by >1 m, more than the lift | 34 m box low-pass (0.20 attenuation at 22 m, 0.96 at 200 m) |
| 4 | **Shader ambient floor washed the asphalt to water-blue** | Unshaded-magenta capture proved the geometry was drawn; the lit capture showed a pale blue surface with no markings | Albedo-scaled light term instead of a flat additive floor; paint gets its own emissive |

Measured invariants from the instrumented run:

* `nearest_road` and car origin differ by **0.00 m** horizontally — the spawn is on
  the tarmac.
* Clearance at the ring radius is **1.70 m by construction** (`ROAD_LIFT 1.15` +
  `ROAD_EMBANKMENT 0.55`); worst-case grid interpolation adds 0.82 m, leaving
  0.88 m of margin. Pinned by a test that samples 24 angles in four regions.

Regression tests added: `terrain faces up`, `road above terrain`.

## Not verified (honest limitations)

* **On-device performance** (60 fps / 120 Hz) — no Android device or emulator
  is attached to CI. Frame-rate claims are design targets, not measurements.
* **Touch feel** (tilt steering, on-screen pedals) — code paths exist and are
  exercised headlessly, but latency/comfort can only be judged on hardware.
* **Audio mix on real speakers** — levels are authored, not monitored.
* **Long-session stability** (30+ minute races, save corruption) — logic is
  unit-tested; endurance is not.
* **RTL layout polish** — Arabic strings render and `is_rtl()` flips layout
  direction, but per-widget mirroring has not been visually reviewed.
* **120 fps** — the v2 target. The redesign cuts overdraw (no SSAO/SSIL in the
  race, single-directional-light shadows, height fog instead of volumetric) and
  every expensive environment feature is behind a quality tier, but the number
  itself still needs a real device.
* **"8K" textures** — not claimed and not shipped. Art is procedurally generated
  at runtime plus small WebP backdrops; the fidelity work is in shaders and
  geometry, which cost VRAM-free ALU instead of bandwidth.

---

# Round 14 — the highway, actually visible

The free-roam capture had been showing sky under the car for several rounds. The
geometry was proven correct early (`mesh_ground: vertices_above_road=0/192`), and
a lift sweep settled the burial question decisively:

| Probe | Magenta pixels | Conclusion |
|---|---|---|
| road material, no lift | 142 | the mesh renders, but almost entirely outside the frame |
| road lifted 8 m | 71,373 | when lifted it fills the frame ⇒ it was never buried |
| road lifted 0 / 1 / 3 m | 918 / 1,015 / 1,072 | lifting changes nothing ⇒ not a depth-fighting or clearance issue |

That is what redirected the work from geometry to **shading and framing**, and it
was the right call.

## The real defect: the ground shader never compiled

The carriageway had been moved into `terrain.gdshader` so it could not possibly be
occluded. It still did not appear. Two independent compile errors meant Godot fell
back to a default material every run:

1. `vec3 road_emission = vec3(0.0);` at **file scope**. Godot only permits
   uniforms, varyings and constants there; a mutable global is a hard error, so the
   *entire* shader failed.
2. `ROUGHNESS = mix(0.95, 0.72, road)` — `road` did not exist; the local is
   `asphalt`.

A shader that fails to compile is indistinguishable from a geometry bug in a
screenshot, which is exactly why this cost so many rounds. The fix is small; the
lesson is not:

* `tools/check_shaders.py` rejects mutable file-scope declarations (instant).
* `tools/check_shader_ids.py` reports identifiers used but never declared (instant).
* `qa-roam.yml` now publishes the real console log and only fails on a genuine
  compile error — and an earlier version of that gate was itself failing on an
  *empty* log, which hid the evidence for two runs.

## Result

`docs/screenshots/qa_roam_chase.png` — captured from the **actual driving camera**
(`--qa-chase`), not the intro orbit — now shows the highway as painted tarmac with
lane dashes, a double centre line, bright edge lines and cyan kerbs, receding into
the horizon with the car on it.

## Also in this round

* 120 fps target (`run/max_fps=120`), an adaptive quality governor
  (`PerfGovernor`) that steps terrain density, shadow distance and glow to hold the
  budget, and an on-screen **measured** frame counter behind a settings toggle.
* Full-screen world map for free roam: terrain-shaded land, the drivable ring
  highway, player heading, opened from the HUD or `M`.
* Four new painted region backdrops, cross-fading behind the title and menu;
  `UIStyle.art()` now accepts PNG or WebP so new art ships without a conversion step.
* Baked reflection probe so paint and wet tarmac mirror the world.
* Retired the road diagnostics (`--qa-std-road`, `--qa-lift`, `qa_height_report`,
  mesh-analysis blocks) now that the question they existed to answer is settled.

## Still not verified

The 120 fps claim remains a **budget and an adaptation strategy**, not a
measurement on hardware; CI renders in software and cannot represent a phone GPU.
The frame counter exists so the number can be checked on a real device in seconds.

---

# Round 15 — "App not installed"

**Reported symptom:** the released APK would not install on the user's phone at
all ("no pa installe"). Not a crash, not a black screen — the package manager
rejected it before any of the game's code ran.

## Root cause

`racing/export_presets.cfg` shipped a 64-bit-only package:

```
architectures/armeabi-v7a=false
architectures/arm64-v8a=true
version/code=1
version/name="1.0.0"
```

A phone whose primary ABI is 32-bit — or a 64-bit phone running a 32-bit ROM —
has no `lib/arm64-v8a/` to load, and Android reports a bare "App not installed"
with no diagnostic. The same preset also carried `version/code=1` permanently, so
every release looked to Android like an older build than whatever was installed
and the update path was broken too.

This is a *packaging* failure, which is why no test caught it: the headless
suite, the script probe, the shader probe and the APK size gate all passed, and
CI even verified the signature. Nothing asserted that the binary could actually
be loaded by the device it was published for.

## Fix

* `architectures/armeabi-v7a=true` alongside `arm64-v8a` — one universal APK that
  installs on both. The engine libraries for the second ABI add roughly the size
  of the native runtime, which the size gate still covers.
* `version/code=20100`, `version/name="2.1.0"` — monotonic, so updates install
  over an existing copy instead of being rejected.

### The second failure, and why it mattered

The first attempt at the fix also pinned `min_sdk=24` / `target_sdk=34`, and the
export immediately started failing with Godot's *blank* configuration error:

```
ERROR: Cannot export project with preset "Android" due to configuration errors:
ERROR: Project export for preset "Android" failed.
```

No message after the colon. That is a known Godot behaviour — the validation can
set `valid = false` without appending any text — and it is genuinely
undiagnosable from a phone screenshot of the log. Removing the two explicit SDK
levels (they are optional; Godot substitutes sane defaults) made the same preset
export successfully with **both** ABIs.

The lesson recorded here: a blank `configuration errors:` line is not "something
is wrong with the environment", it is "one of the optional override fields is
blank or malformed". Leave overrides out unless they are required.

## Two new gates, so this cannot ship again

| Gate | Where | What it asserts |
|---|---|---|
| `tools/check_export_presets.py` | CI `verify`, instant | both `arm64-v8a` and `armeabi-v7a` enabled, `version/code >= 1`, version name present |
| APK ABI assertion | CI `build`, after export | `unzip -l` of the *actual artifact* must contain `lib/arm64-v8a/` **and** `lib/armeabi-v7a/` |

The second one matters most: it inspects the artifact that is about to be
published, so a preset that looks correct but produces a single-ABI package is
still caught.

## Lesson

The preset is a first-class source file. It was tracked, but nothing parsed it,
so a one-line flag decided whether the entire release was usable. Checks belong
on the artifact and on its configuration, not only on the code that goes into it.

---

# Round 16 — v3.1, "the car actually drives"

The report that mattered was the simplest one possible: **the car does not
move.** Everything else in this round is secondary to that.

## The bug, and why it survived three releases

`CarController._physics_process()` called `_read_input()` every physics tick.
`_read_input()` sets `throttle` from `Input.get_action_strength("throttle")`,
which on a phone with no keyboard is always `0.0`. The touch pedals called
`set_inputs(...)`, which wrote the correct throttle — and then the very next
physics tick overwrote it with zero.

So on the one device this game is for, the accelerator was a no-op. Free roam
had a second, independent version of the same failure: its `_process` branch
never called `_read_driver_input()` at all, so nothing ever wrote `set_inputs()`
in that mode regardless of the keyboard.

| Fix | File |
|---|---|
| `_last_external_input_msec` stamped by `set_inputs()`; keyboard polling suppressed for 150 ms afterwards | `vehicle/CarController.gd` |
| free roam now reads the pedals every frame, not only during `state == "racing"` | `ui/screens/race.gd` |
| regression test: 60 ticks of full throttle through `set_inputs()` must produce speed | `tests/TestRunner.gd`, `[SUITE] SECTION drive` |

The 150 ms window matters: it keeps the desktop keyboard working while making
touch authoritative whenever it is present, and it means a dropped touch frame
cannot instantly cut the throttle to zero mid-corner.

## What else was found while testing this

| Finding | Why it mattered | Fix |
|---|---|---|
| `_road_lateral()` returns **0..1**, not metres | the surface sampler compared it to `11.0` and so always reported "on road" | convert to metres from the centre-line before the threshold |
| `gameplay_tuning` was declared and never filled | the engine note and the new off-road model read an empty dictionary | populated from `Game.physics_for()` when the car spawns |
| drift score decayed to zero the instant you stopped sliding | drifting could never accrue anything | combo with a 1.6 s grace window, multiplier to x8, banked on timeout |
| the garage keyed the car with **magenta** | every paint colour read violet | relit as a photographic studio: warm key, cool fill, hard rim, floor bounce |
| the mode row had six 232 px chips | 6 x 232 = 1392 px, overflows a 1080p phone in portrait | 3x2 grid, chips expand to available width |
| `_add_box` always parented to the shell | the greenhouse could not be hidden at distance, so LOD had nothing to switch | scoped parent while the glass house is built |
| quality steps only hid glow | the actual phone costs (shadows, traffic, particles) were never scaled | steps now set shadow atlas size, traffic density, particle scale and LOD bias |
| boot progress was a timed animation | it reported work that had not happened | it now loads four real resources and reports each one |

## Gates

All five run green locally before the push:

```
undeclared-identifier check: 42 files clean
shader-scope check: 4 file(s) clean
shader-identifier check: 4 file(s) clean
export-preset check: 2 ABI(s) enabled (armeabi-v7a, arm64-v8a), versionCode ok
physics gate: PASS   (5 classes, 0.0 % target error, 0-100 in 2.8-9.1 s)
```

Every `.gd` in `scripts/` and `tests/` (52 files) parses with `gdparse`, and a
cross-file audit confirms every method and signal the race screen calls on the
new systems exists in the file that owns it (44 methods, 7 signals, all present).

## Still not verified on hardware

Unchanged from previous rounds and stated plainly:

* frame rate is a budget plus an adaptive governor, measured **in the sandbox**,
  not on a phone;
* audio is authored and levelled, never monitored through a speaker;
* the four new sounds are synthesised, so they are clean but not sampled from a
  real car;
* the police AI is deterministic pursuit, not behaviour-tree traffic AI — it
  chases well and it does not coordinate, and this document says so rather than
  claiming otherwise.

## Round 17 — Tyre model rebuilt (lateral dynamics)

The old "drift" was cosmetic: `_apply_motion` added a sideways offset proportional
to `drift_amount * sign(steer)`, and `_slip` was a yaw-excess guess. The chassis
therefore always travelled exactly where it pointed, and a handbrake slide felt
like the whole car being nudged sideways. It also looked wrong at speed — a fast
corner produced a slip number with no actual sideways travel behind it.

Replaced with a slip-angle model in `CarController`:

* `lateral_speed` — the mass's sideways velocity in the car's own frame.
* Per tick the corner needs `yaw_rate * speed` of centripetal force; the tyres can
  deliver `grip * 9.81 * 1.45`. Any excess accelerates the mass sideways (damped
  by 0.55, because a tyre that breaks away does not lose all grip at once — an
  undamped version spun the car inside a second).
* Handbrake applies a sustained sideways force rather than an impulse.
* Self-aligning torque pulls the yaw back toward the direction of travel whenever
  the wheel is not held at full lock, so a slide recovers instead of spinning.
* Terminal slide is capped at `0.62 * speed + 4 m/s` (about 32°), because a car
  cannot stay on its wheels at 40°+ and an uncapped value reached 46 m/s.
* `_slip` now reads the true sideways fraction. `drift_amount` derives from it,
  so smoke, marks, screech and the drift score all follow real motion.

Verified against the tests the CI runs (Python replay of the exact tick sequence):

| case | lateral | slip | result |
| --- | --- | --- | --- |
| 12 m/s, 0.55 steer | 0.00 | 0.00 | grips |
| 48 m/s, full lock | 27.29 | 0.77 | slides |
| released after the slide | 0.00 | 0.00 | recovers |
| 40 m/s handbrake, 10 ticks | — | 0.056 | smokes |

Gates: 42 files parsed, `gdlint scripts tests` clean, `check_types` 42/42,
`check_undeclared` 42/42, `physics_sim` PASS, presets 2 ABI, 4 shaders clean.

## Round 18 — Four defects that only appear on a real circuit race

CI's import + script-load step caught errors that `gdparse` and `gdlint` cannot
see, because both are pure syntax tools. All four are the same species: a member
or a constant assumed to exist on whichever host object happened to be passed in.

1. **`TrackData.half_width` never existed.** `race.gd:_tick_surfaces` read
   `builder.data.half_width` every frame the car was on a track. `TrackData`
   stores a per-point `widths` array, so the property access raised
   *"Invalid access to property or key 'half_width'"* on every tick — the car's
   surface and grip were never updated on a circuit. Now `widths[idx] * 0.5`,
   and the comparison is `absf(lateral)` because `project()` returns a signed
   distance (a car to the LEFT of the line was being called "on road" at any
   distance).
2. **`TrafficSystem.build()` was handed a `TrackBuilder`.** It read
   `world.ROAD_RING_RADIUS` unconditionally, which threw, and the exception
   aborted the rest of the build: **traffic, pedestrians and police were all
   dead on every circuit race.** Host type is now decided by probing for
   `road_points` (a const cannot be seen by `get()`, so probing for the constant
   itself would not work).
3. **Division by zero on circuits.** `ring_radius` was set to 0 as a sentinel,
   but three places still divided by it: traffic angular advance, the
   following-distance gap, and pedestrian walking. Every civilian car and
   pedestrian angle became NaN on the first tick. Replaced with `perimeter`,
   computed from the circuit's own polyline length (or `r * TAU` for the ring).
4. **Police spawned at an arbitrary bearing.** `atan2(player.z, player.x)` is
   the ring's parameterisation and means nothing on a circuit; police appeared
   in the scenery. They now spawn at the nearest point on the host centreline.

Verified numerically: on a 1600 m square circuit and on the 3895 m ring, traffic
at 20 m/s travels exactly 200 m in 10 s, and the 0.05 rad following gap is 12.7 m
and 31.0 m respectively (finite and non-zero on both).

Also fixed this round: the lateral-dynamics test called `set_inputs()` once, but
`steer` only slews 0.18 per call, so the car was steering 0.18 rather than 1.0
and never broke traction. The test now feeds inputs every tick, like the phone.

| gate | result |
| --- | --- |
| gdparse | 42/42 |
| gdlint scripts tests | clean |
| check_types | 42/42 |
| check_undeclared | 42/42 |
| physics_sim | PASS |
| export presets | 2 ABI |
| shaders | 4 clean |

## Round 19 — The gate that catches what gdparse cannot

`_hold_inputs(car, speed, steer, ticks)` was rewritten to `(car, steer, ticks)`
and three call sites still passed four arguments. `gdparse`: clean. `gdlint`:
clean. Godot: *"Too many arguments for _hold_inputs() call"* — and the entire
test suite failed to load, costing a full CI cycle that also builds the APK.

Neither syntax tool resolves signatures, so this is permanently invisible to
both. Added `tools/check_arity.py` to the lint job.

It is scoped per class, not per project. A global name table produced ~120 false
positives because `build()`, `setup()` and `tick()` exist in many files with
different signatures; the gate resolves a bare call against the calling file and
its `extends` chain only. `Foo.bar(...)` calls (autoloads, `class_name`) are
deliberately not checked — a missed case is cheaper than a blocked build.

Verified both ways:

| probe | expected | got |
| --- | --- | --- |
| the real `_hold_inputs` regression | fail, 3 sites | fail, 3 sites |
| one argument too few | fail | fail |
| exact arity + optional defaults | pass | pass |
| string arguments counted correctly | fail only on the bad call | correct |
| same method name in two classes | resolved per class | correct |

It immediately earned its place: the very next edit to `TestRunner.gd`
(`_hold_inputs(mc, mc.speed, 0.0, 240)` after the helper lost its speed
parameter) was caught before a push, not after a CI cycle.

Also fixed in the same block: the recovery assertion was **vacuous**. The
`_hold_inputs` helper reset `lateral_speed` to zero on entry, and the recovery
check called exactly that helper, so it would pass no matter what the physics
did. The reset moved to `_corner_from()`; recovery now observes the state the
slide left behind.

Gates: 42 files parsed, lint clean, types 42/42, undeclared 42/42, arity 43/43
(578 functions resolved), presets 2 ABI, 4 shaders clean, physics PASS.
