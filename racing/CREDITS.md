# APEX VELOCITY — Credits & Asset Provenance

Every asset shipped with the game is either **original work generated for this
project** (released CC0) or a **third-party work used under a listed license**.
No copyrighted car brands, manufacturer logos, commercial music or scraped
imagery are used. All vehicles, tracks, teams and audio cues are fictional.

## Runtime / toolchain

| Component | Version | License | Source |
|---|---|---|---|
| Godot Engine | 4.4.1 | MIT | https://godotengine.org |
| Godot Android export templates | 4.4.1 | MIT | godotengine.org releases |
| gdtoolkit (CI lint only) | 4.x | MIT | github.com/Scony/godot-gdscript-toolkit |

## Typefaces

All fonts are redistributed under the **SIL Open Font License 1.1**; the full
license text ships next to each font in `racing/assets/fonts/`.

| Font | Weights used | License file |
|---|---|---|
| Orbitron (Matt McInerney) | Variable 400–900 | `OFL-Orbitron.txt` |
| Rajdhani (Indian Type Foundry) | Medium / SemiBold / Bold | `OFL-Rajdhani.txt` |
| Exo 2 (Natanael Gama) | Variable (fallback display) | `OFL-Exo2.txt` |

Arabic UI text renders through the platform font (`SystemFont`, Noto Sans
Arabic when installed) so no extra font file needs to be bundled.

## Icons, menu art and textures

Generated deterministically by `racing/tools/generate_assets.py` (Pillow +
NumPy), **original artwork, CC0**:

* 31 UI icons — `racing/assets/icon/*.png`
* 5 menu/marketing backdrops + 7 track thumbnails (WebP) — `racing/assets/art/`
* 7 tileable PBR-ish textures (asphalt, concrete, carbon, decals, tarmac lines,
  metal flake, sky gradient) — `racing/assets/textures/`
* Launcher icon + adaptive icon foreground/background — `racing/assets/icon/icon_*.png`

## Audio

All 15 SFX and 4 music beds are **synthesised from scratch** by
`tools/generate_assets.py` (additive/subtractive synthesis + noise shaping),
then encoded to Ogg Vorbis. Original work, CC0. No sample packs, no commercial
tracks, no third-party loops.

## Geometry

Cars, tracks, city blocks, terrain, vegetation, sky shaders and particle systems
are all generated at runtime from code (`scripts/vehicle/CarModel.gd`,
`scripts/race/TrackLibrary.gd`, `TrackBuilder.gd`, `EnvironmentRig.gd`).
No third-party 3D models are used.

## Reused open-source code

None. All gameplay, UI and tooling code in `racing/` was written for this
project. The CI workflow pattern (headless Godot import → export → aapt2 /
apksigner verification) was adapted from this repository's earlier workflow
(`nova-mira-build.yml`), which is itself original work of this repository.

## Reporting

If you believe something in the build is misattributed, open an issue on the
repository and it will be corrected or replaced.
