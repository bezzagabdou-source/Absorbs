#!/usr/bin/env python3
"""Catch assignments to Godot properties that do not exist.

Why this exists
---------------
`env.reflection_source_size = 512` is valid GDScript to every syntax tool: it is
an assignment to a member of a typed object. Godot raises it at runtime as
"Invalid assignment of property or key ... on a base object of type
'Environment'", which in CI appears as a script error inside the test job and
costs a full cycle to discover.

The same round produced a second instance of the same class: `ssr_enabled` was
being set on an Environment in a project that renders with gl_compatibility,
where the engine logs "Screen-space reflections can only be enabled when using
the Forward+ renderer". A property that exists but is inert is just as much a
bug as one that does not.

What is checked
---------------
An allowlist of Environment properties this project actually uses, verified
against the Godot 4.4 class reference. Any `environment_obj.NAME =` or
`e.NAME =` where NAME looks like an Environment setting (it starts with one of
the known Environment prefixes) but is not on the list is reported.

Deliberately narrow: this only looks at the prefixes below, so a variable named
`e` that is actually a Node is not checked, and unrelated assignments cannot
produce false failures.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Godot 4.4 Environment properties, restricted to the prefixes this project sets.
VALID_ENVIRONMENT = {
    "background_mode", "background_color", "background_energy_multiplier",
    "background_intensity", "background_canvas_max_layer",
    "sky", "sky_rotation", "sky_custom_fov",
    "ambient_light_source", "ambient_light_color", "ambient_light_sky_contribution",
    "ambient_light_energy", "ambient_light_energy_multiplier",
    "reflected_light_source", "tonemap_mode", "tonemap_exposure", "tonemap_white",
    "tonemapper_mode",
    "glow_enabled", "glow_intensity", "glow_strength", "glow_bloom", "glow_blend_mode",
    "glow_hdr_threshold", "glow_hdr_scale", "glow_hdr_luminance_cap", "glow_normalized",
    "glow_map", "glow_map_strength",
    "fog_enabled", "fog_mode", "fog_light_color", "fog_light_energy", "fog_density",
    "fog_aerial_perspective", "fog_sky_affect", "fog_height", "fog_height_density",
    "fog_sun_scatter", "fog_depth_curve", "fog_depth_begin", "fog_depth_end",
    "volumetric_fog_enabled", "volumetric_fog_density", "volumetric_fog_albedo",
    "volumetric_fog_emission", "volumetric_fog_gi_inject", "volumetric_fog_length",
    "volumetric_fog_detail_spread", "volumetric_fog_ambient_inject",
    "volumetric_fog_anisotropy", "volumetric_fog_temporal_reprojection_enabled",
    "ssao_enabled", "ssao_radius", "ssao_intensity", "ssao_power", "ssao_detail",
    "ssao_horizon", "ssao_sharpness", "ssao_light_affect", "ssao_ao_channel_affect",
    "ssil_enabled", "ssil_radius", "ssil_intensity", "ssil_sharpness",
    "ssil_normal_rejection",
    "ssr_enabled", "ssr_max_steps", "ssr_fade_in", "ssr_fade_out",
    "ssr_depth_tolerance",
    "sdfgi_enabled", "sdfgi_use_occlusion", "sdfgi_read_sky_light",
    "sdfgi_bounce_feedback", "sdfgi_cascades", "sdfgi_min_cell_size",
    "sdfgi_cascade0_distance",
    "adjustment_enabled", "adjustment_brightness", "adjustment_contrast",
    "adjustment_saturation", "adjustment_color_correction",
    "dof_blur_far_enabled", "dof_blur_near_enabled", "dof_blur_amount",
}

# Only names beginning with one of these are treated as Environment settings.
PREFIXES = (
    "ssao_", "ssil_", "ssr_", "sdfgi_", "glow_", "fog_", "volumetric_fog_",
    "adjustment_", "ambient_light_", "background_", "reflected_light_",
    "tonemap", "dof_blur_", "reflection_source", "sky_",
)

ASSIGN_RE = re.compile(r"^\s*([A-Za-z_]\w*)\.([a-z_][a-z0-9_]*)\s*(?:=|:)\s", re.M)
# Which locals are actually Environment objects: anything assigned Environment.new()
ENV_VAR_RE = re.compile(r"([A-Za-z_]\w*)\s*(?::\s*Environment\s*)?=\s*Environment\.new\(\)")


def check(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    env_vars = set(ENV_VAR_RE.findall(src))
    # also accept the conventional names when they are used as Environment
    for extra in ("environment", "e", "env"):
        if re.search(r"\b%s\s*:\s*Environment\b" % extra, src):
            env_vars.add(extra)
    if not env_vars:
        return []
    problems: list[str] = []
    for m in ASSIGN_RE.finditer(src):
        var, prop = m.group(1), m.group(2)
        if var not in env_vars:
            continue
        if not prop.startswith(PREFIXES):
            continue
        if prop in VALID_ENVIRONMENT:
            continue
        line = src.count("\n", 0, m.start()) + 1
        problems.append(
            f"{path.relative_to(ROOT)}:{line}: {var}.{prop} is not an "
            f"Environment property in Godot 4.4")
    return problems


def main() -> int:
    files = sorted(ROOT.rglob("*.gd"))
    problems: list[str] = []
    for p in files:
        if any(part in (".godot", "build") for part in p.relative_to(ROOT).parts):
            continue
        problems.extend(check(p))
    if problems:
        print("engine-property check FAILED:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1
    print(f"engine-property check: {len(files)} file(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
