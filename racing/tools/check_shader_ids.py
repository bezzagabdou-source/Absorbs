#!/usr/bin/env python3
"""Catch undefined identifiers inside .gdshader files.

Two rounds were lost to shaders that failed to compile for reasons the parser
never sees: a mutable global, then `ROUGHNESS = mix(0.95, 0.72, road)` where
`road` did not exist. When a shader fails Godot falls back to a default material,
so the screenshot looks like a *geometry* bug and the investigation goes the
wrong way for hours.

This walks each shader, collects every identifier that is declared (uniforms,
varyings, locals, function names, parameters, built-ins) and reports the ones
that are used but never declared. It is a heuristic, not a compiler, but it
catches exactly the class of typo that costs a CI round.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Names Godot's shader language provides without a declaration.
BUILTINS = {
    # vertex / fragment outputs
    "ALBEDO", "ALPHA", "ALPHA_SCISSOR_THRESHOLD", "ALPHA_HASH_SCALE", "ALPHA_ANTIALIASING_EDGE",
    "ALPHA_TEXTURE_COORDINATE", "ANISOTROPY", "ANISOTROPY_FLOW", "AT_CUBEMAP_PASS",
    "AT_LIGHT_PASS", "BACKLIGHT", "BONE_INDICES", "BONE_WEIGHTS", "COLOR", "CUSTOM0",
    "CUSTOM1", "DEPTH", "DIFFUSE_LIGHT", "EMISSION", "FRAGCOORD", "FOG", "FOG_DEPTH",
    "FOG_LIGHT_DIR", "INSTANCE_CUSTOM", "INSTANCE_ID", "LIGHT", "LIGHT_COLOR", "LIGHT_IS_DIRECTIONAL",
    "LIGHT_VERTEX", "METALLIC", "METALLIC_SPECULAR", "MODEL_MATRIX", "MODEL_NORMAL_MATRIX",
    "NORMAL", "NORMAL_MAP", "NORMAL_MAP_DEPTH", "POSITION", "POINT_COORD", "POINT_SIZE",
    "PROJECTION_MATRIX", "RIM", "RIM_TINT", "ROUGHNESS", "SCREEN_PIXEL_SIZE", "SPECULAR",
    "SPECULAR_LIGHT", "SSS_STRENGTH", "SSS_TRANSMITTANCE_COLOR", "SSS_TRANSMITTANCE_DEPTH",
    "SSS_TRANSMITTANCE_STRENGTH", "TANGENT", "TANGENT_BINORMAL", "TANGENT_BINORMAL_SIGN",
    "TIME", "TRANSMITTANCE_COLOR", "UV", "VERTEX", "VIEW", "VIEW_MATRIX", "VIEWPORT_SIZE",
    # functions
    "abs", "acos", "all", "any", "asin", "atan", "ceil", "clamp", "cos", "cosh", "cross",
    "degrees", "determinant", "distance", "dot", "exp", "exp2", "faceforward", "floor",
    "fma", "fract", "fwidth", "inverse", "inversesqrt", "isinf", "isnan", "length", "lerp",
    "log", "log2", "matrixCompMult", "max", "min", "mix", "mod", "normalize", "outerProduct",
    "pow", "radians", "reflect", "refract", "round", "roundEven", "sign", "sin", "sinh",
    "smoothstep", "sqrt", "step", "tan", "tanh", "texture", "textureLod", "transpose",
    "trunc", "texelFetch", "dFdx", "dFdy", "floatBitsToInt", "intBitsToFloat", "packHalf2x16",
    "unpackHalf2x16", "bitfieldExtract", "bitfieldInsert", "bitfieldReverse", "findLSB",
    "findMSB", "float", "int", "uint", "bool", "vec2", "vec3", "vec4", "ivec2", "ivec3",
    "ivec4", "uvec2", "uvec3", "uvec4", "bvec2", "bvec3", "bvec4", "mat2", "mat3", "mat4",
    "mat2x2", "mat3x3", "mat4x4", "if", "else", "for", "while", "return", "const", "in",
    "out", "inout", "true", "false", "void", "struct", "uniform", "varying", "shader_type",
    "render_mode", "instance", "uniform", "hint_range", "source_color", "filter_nearest",
    "repeat_enable", "disable_fog", "unshaded", "blend_mix", "depth_draw_opaque",
    "depth_prepass_alpha", "cull_back", "cull_disabled", "skip_vertex_transform",
    "vertex_lighting", "ambient_light_disabled", "world_vertex_coords", "shadow_to_opacity",
    # shader types and built-in function names from the Godot shading language
    "spatial", "canvas_item", "particles", "sky", "diffuse_burley",
    "diffuse_lambert", "diffuse_lambert_wrap", "diffuse_toon", "specular_schlick_ggx",
    "specular_toon", "specular_disabled", "sampler2D", "sampler2DArray", "samplerCube",
    "sampler3D", "textureSize", "hint_default_white", "hint_default_black",
}

# Swizzle components. Matching these would need real type tracking; they are
# never a declaration so they are simply not worth reporting.
SWIZZLE = re.compile(r"^[xyzwrgba]{1,4}$")


def identifiers(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text))


def check(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    # strip comments so prose does not count as a declaration or a use
    src = re.sub(r"//[^\n]*", "", src)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)

    declared: set[str] = set()
    # uniform/varying/const declarations (including comma lists)
    for m in re.finditer(r"\b(?:uniform|varying|const|instance)\s+[A-Za-z0-9_]+\s+([^;{}]+);", src):
        for name in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)):
            declared.add(name)
    # function names and their parameters
    for m in re.finditer(r"\b[A-Za-z_][A-Za-z0-9_]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{", src):
        declared.add(m.group(1))
        for name in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", m.group(2)):
            declared.add(name)
    # locals: "type name" and assignments "name =" / "name +=" etc.
    for m in re.finditer(r"\b(?:float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)\s+([A-Za-z_][A-Za-z0-9_]*)", src):
        declared.add(m.group(1))
    for m in re.finditer(r"\b(?:for|while)\s*\(\s*(?:int|uint|float)\s+([A-Za-z_][A-Za-z0-9_]*)", src):
        declared.add(m.group(1))

    problems: list[str] = []
    lines = src.splitlines()
    for lineno, line in enumerate(lines, 1):
        # only look at identifiers used as a value, never the declared side
        for name in re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\b", line):
            if name in declared or name in BUILTINS or SWIZZLE.match(name):
                continue
            if re.search(r"\b(?:float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|bvec[234]"
                         r"|mat[234](?:x[234])?)\s+" + re.escape(name) + r"\b", line):
                continue
            problems.append("%s:%d undefined identifier '%s'"
                            % (path.relative_to(ROOT), lineno, name))
    return problems


def main() -> int:
    files = sorted(ROOT.glob("shaders/*.gdshader"))
    problems: list[str] = []
    for f in files:
        problems.extend(check(f))
    if problems:
        print("shader identifier problems:")
        for p in problems:
            print("  " + p)
        return 1
    print("shader-identifier check: %d file(s) clean" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
