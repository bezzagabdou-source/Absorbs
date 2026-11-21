#!/usr/bin/env python3
"""Catch identifiers that are used but never declared anywhere in the project.

`gdparse` only checks syntax. It happily accepts `marker.position = centre` when
`centre` was deleted three lines above -- Godot's own compiler is the only thing
that rejects it, and by then the mistake has cost a full CI round.

This gate is deliberately conservative: an identifier is only reported when it
is used as a bare value in some file and appears NOWHERE in the project as a
declaration, function name, class name, signal, or all-caps constant. Anything
the engine provides (Vector3, position, TAU, ...) is covered by BUILTINS plus an
allow-list gathered from the code itself.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".godot", "assets", "docs", "tools"}

# function signatures, including ones split over several lines
FUNC_SIG = re.compile(r"\bfunc\s+[A-Za-z_]\w*\s*\(((?:[^()]|\([^()]*\))*)\)", re.S)

DECL_PATTERNS = [
    re.compile(r"\bvar\s+([A-Za-z_]\w*)"),
    re.compile(r"\bconst\s+([A-Za-z_]\w*)"),
    re.compile(r"\bfunc\s+([A-Za-z_]\w*)"),
    re.compile(r"\bsignal\s+([A-Za-z_]\w*)"),
    re.compile(r"\bclass_name\s+([A-Za-z_]\w*)"),
    re.compile(r"\benum\s+([A-Za-z_]\w*)"),
    re.compile(r"\bfor\s+([A-Za-z_]\w*)\s+in\b"),
]

BUILTINS = {
    # globals / singletons
    "self", "true", "false", "null", "and", "or", "not", "in", "is", "as",
    "if", "else", "elif", "for", "while", "return", "break", "continue", "pass",
    "await", "match", "super", "yield", "static", "func", "var", "const", "class",
    "extends", "preload", "load", "print", "printerr", "push_error", "push_warning",
    "range", "len", "str", "int", "float", "bool", "abs", "absf", "min", "max",
    "mini", "maxi", "minf", "maxf", "clamp", "clampf", "clampi", "lerp", "lerpf",
    "sign", "signf", "pow", "sqrt", "sin", "cos", "tan", "atan2", "atan", "acos",
    "asin", "deg_to_rad", "rad_to_deg", "round", "roundi", "floor", "floori",
    "ceil", "ceili", "fmod", "fposmod", "smoothstep", "is_instance_valid",
    "randf", "randi", "randf_range", "randi_range", "wrapf", "wrapi", "snapped",
    "PI", "TAU", "INF", "NAN", "E", "Vector2", "Vector3", "Vector4", "Vector2i",
    "Vector3i", "Color", "Basis", "Transform2D", "Transform3D", "Quaternion",
    "Rect2", "Rect2i", "AABB", "Plane", "NodePath", "StringName", "Array",
    "Dictionary", "PackedByteArray", "PackedFloat32Array", "PackedInt32Array",
    "PackedStringArray", "PackedVector2Array", "PackedVector3Array", "Callable",
    "Signal", "Type", "Variant", "String",
    # node / resource classes used bare
    "Node", "Node2D", "Node3D", "Control", "CanvasItem", "Object", "RefCounted",
    "Resource", "SceneTree", "Engine", "OS", "Input", "InputMap", "Time",
    "DisplayServer", "RenderingServer", "PhysicsServer3D", "ProjectSettings",
    "Performance", "RandomNumberGenerator", "FastNoiseLite", "Tween", "Timer",
    "Label", "Button", "ColorRect", "TextureRect", "Control", "VBoxContainer",
    "HBoxContainer", "GridContainer", "CenterContainer", "PanelContainer",
    "MarginContainer", "ScrollContainer", "SubViewport", "SubViewportContainer",
    "Viewport", "Camera3D", "WorldEnvironment", "Environment", "Sky",
    "DirectionalLight3D", "OmniLight3D", "SpotLight3D", "MeshInstance3D",
    "MultiMeshInstance3D", "MultiMesh", "Mesh", "BoxMesh", "SphereMesh",
    "CylinderMesh", "PlaneMesh", "TorusMesh", "QuadMesh", "PrismMesh",
    "StandardMaterial3D", "ShaderMaterial", "Shader", "Material", "MeshMaterial3D",
    "SurfaceTool", "StaticBody3D", "CollisionShape3D", "CollisionShape",
    "BoxShape3D", "SphereShape3D", "CharacterBody3D", "Area3D", "RayCast3D",
    "GPUParticles3D", "CPUParticles3D", "ParticleProcessMaterial", "Curve",
    "Curve3D", "Path3D", "PathFollow3D", "AnimationPlayer", "Animation",
    "AudioStreamPlayer", "AudioStreamPlayer3D", "AudioStream",
    "AudioStreamGenerator", "AudioStreamGeneratorPlayback", "AudioEffect",
    "AudioServer", "ConfigFile", "FileAccess", "DirAccess", "JSON", "Image",
    "ImageTexture", "Font", "FontFile", "FontVariation", "LabelSettings",
    "StyleBoxFlat", "StyleBoxTexture", "Gradient", "GradientTexture2D",
    "Theme", "ThemeDB", "TextLine", "PlaceholderTexture2D", "NoiseTexture2D",
    # common member names that appear bare in expressions
    "position", "rotation", "rotation_degrees", "scale", "size", "name", "text",
    "color", "modulate", "visible", "material", "mesh", "shader", "fov",
    "transform", "basis", "origin", "global_position", "global_transform",
    "velocity", "speed", "delta", "children", "parent", "owner", "scene_file_path",
    # built-in signals that are frequently connected by name
    "resized", "gui_input", "draw", "pressed", "toggled", "value_changed",
    "text_changed", "text_submitted", "item_selected", "mouse_entered",
    "mouse_exited", "focus_entered", "focus_exited", "body_entered",
    "body_exited", "area_entered", "area_exited", "timeout", "finished",
    "animation_finished", "tree_entered", "tree_exited", "ready",
    "visibility_changed", "changed", "item_activated", "confirmed", "canceled",
}

DEBUG = "-v" in sys.argv

IDENT = re.compile(r"[A-Za-z_]\w*")
# Words that only ever appear as prose in an English comment cannot execute, so
# they are not tracked; this is a noise filter, not a correctness shortcut.
PROSE_ONLY: set[str] = set()
# A "bare value use" is what actually breaks compilation: the identifier appears
# where a value must be, and it is not immediately called. Restricting to these
# two forms (member access on the identifier, and assignment from it) keeps the
# gate free of false positives from parameter lists and call arguments.
USE_PATTERNS = [
    # x.something  (member access on a bare identifier)
    re.compile(r"(?<![\w.])[A-Za-z_]\w*(?=\s*\.[A-Za-z_])"),
    # = x   /  == x  /  += x   where x is not a call and not a number
    re.compile(r"=[=+\-*/]?[ \t]*([A-Za-z_]\w*)(?![\w(])"),
]

KEYWORDS = BUILTINS


def strip_comments_and_strings(src: str) -> str:
    out = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch == "#":
            while i < n and src[i] != "\n":
                i += 1
        elif ch in "\"'":
            quote = ch
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == quote:
                    i += 1
                    break
                i += 1
            out.append(" ")
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def declarations(src: str) -> set[str]:
    names: set[str] = set()
    for m in FUNC_SIG.finditer(src):
        for part in m.group(1).split(","):
            nm = part.split(":")[0].split("=")[0].strip()
            if nm and IDENT.fullmatch(nm):
                names.add(nm)
    for pat in DECL_PATTERNS:
        for m in pat.finditer(src):
            group = m.group(1)
            if "," in group:  # parameter list
                for part in group.split(","):
                    part = part.strip()
                    if not part:
                        continue
                    nm = part.split(":")[0].split("=")[0].strip()
                    if IDENT.fullmatch(nm or ""):
                        names.add(nm)
            elif group and IDENT.fullmatch(group):
                names.add(group)
    return names


def main() -> int:
    files = [p for p in ROOT.rglob("*.gd") if not (set(p.parts) & SKIP_DIRS)]
    sources = {}
    raw: dict[Path, str] = {}
    declared: set[str] = set()
    for p in files:
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        raw[p] = text              # keeps `extends "res://..."` intact
        src = strip_comments_and_strings(text)
        sources[p] = src
        declared |= declarations(src)
    if DEBUG:
        print(f"[debug] {len(sources)} files, {len(declared)} declarations")

    # GDScript resolves a bare identifier against the current file only: another
    # file declaring `centre` does not make `centre` valid here. That per-file
    # scope is precisely the bug class this gate exists to catch, so the known
    # set is file-local. Cross-file members are reached through an object
    # (`player.speed`), which never reaches this check.
    # A screen extends ScreenBase, so inherited members (`content`, `router`)
    # resolve in the child file. Collect declarations from every base class in
    # the `extends "res://..."` chain.
    inherited: dict[Path, set[str]] = {}
    for p, src in sources.items():
        acc: set[str] = set()
        cur = p
        seen: set[Path] = set()
        while cur and cur not in seen:
            seen.add(cur)
            acc |= declarations(sources.get(cur, ""))
            # `extends` lives in a string literal, which the stripper blanks, so
            # the inheritance chain is read from the raw file
            m = re.search(r'extends\s+"res://([^"]+)"', raw.get(cur, ""))
            if not m:
                break
            nxt = ROOT / m.group(1)
            cur = nxt if nxt in sources else None
        inherited[p] = acc

    known_cache = KEYWORDS
    problems = []
    for p, src in sources.items():
        used: set[str] = set()
        for pat in USE_PATTERNS:
            for m in pat.finditer(src):
                tok = m.group(1) if m.groups() else m.group(0)
                if tok:
                    used.add(tok)
        known = known_cache | inherited.get(p, set())
        for ident in sorted(used):
            if ident in known or len(ident) < 3:
                continue
            if ident[0].isupper():
                continue          # class / constant or engine type
            # locals declared in this file are fine even if the regex missed them
            problems.append(f"{p.relative_to(ROOT)}: '{ident}' is used but never declared")

    if problems:
        print("undeclared identifier(s) found:")
        for msg in problems:
            print("  " + msg)
        return 1
    print(f"undeclared-identifier check: {len(files)} files clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
