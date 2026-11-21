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
