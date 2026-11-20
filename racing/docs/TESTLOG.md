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
