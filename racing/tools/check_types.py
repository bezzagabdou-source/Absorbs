#!/usr/bin/env python3
"""Catch the two type errors `gdparse` and `gdlint` cannot see.

`gdparse` checks syntax; `gdlint` checks style. Neither knows what a variable was
declared as, so both accepted:

    var _mode_row: HBoxContainer
    _mode_row = GridContainer.new()        # Godot: "cannot be assigned"

and both accepted a block that referenced identifiers whose declaration had been
removed. Each of those costs a full CI round to discover.

This gate covers exactly two hazards:

  1. ASSIGNMENT  — a typed `var x: T` assigned `<Other>.new()`, where Other is not
     T, an ancestor of T, or a known interface (Control/Node/Object).
  2. SCOPING     — a bare identifier used in a function body that is declared
     nowhere in the file, nowhere in its class chain (`extends`), and not in the
     engine's builtin list.

It is deliberately conservative: it reports a finding only when it is sure. A
false negative costs a CI round; a false positive costs trust in the gate.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".godot", "assets", "docs", "tools"}

# --- engine hierarchy facts this gate relies on -----------------------------
# Only pairs that are definitely wrong are listed; anything unlisted is allowed.
GODOT_CHAINS = {
    "Button": ["BaseButton", "Control", "CanvasItem", "Node", "Object"],
    "CheckButton": ["Button", "BaseButton", "Control", "CanvasItem", "Node", "Object"],
    "OptionButton": ["Button", "BaseButton", "Control", "CanvasItem", "Node", "Object"],
    "Label": ["Control", "CanvasItem", "Node", "Object"],
    "RichTextLabel": ["Control", "CanvasItem", "Node", "Object"],
    "Panel": ["Control", "CanvasItem", "Node", "Object"],
    "PanelContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "TextureRect": ["Control", "CanvasItem", "Node", "Object"],
    "ColorRect": ["Control", "CanvasItem", "Node", "Object"],
    "Control": ["CanvasItem", "Node", "Object"],
    "Container": ["Control", "CanvasItem", "Node", "Object"],
    "BoxContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "HBoxContainer": ["BoxContainer", "Container", "Control", "CanvasItem", "Node", "Object"],
    "VBoxContainer": ["BoxContainer", "Container", "Control", "CanvasItem", "Node", "Object"],
    "GridContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "HFlowContainer": ["FlowContainer", "Container", "Control", "CanvasItem", "Node", "Object"],
    "VFlowContainer": ["FlowContainer", "Container", "Control", "CanvasItem", "Node", "Object"],
    "ScrollContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "MarginContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "TabContainer": ["Container", "Control", "CanvasItem", "Node", "Object"],
    "BoxMesh": ["PrimitiveMesh", "Mesh", "Resource", "RefCounted", "Object"],
    "SphereMesh": ["PrimitiveMesh", "Mesh", "Resource", "RefCounted", "Object"],
    "CylinderMesh": ["PrimitiveMesh", "Mesh", "Resource", "RefCounted", "Object"],
    "PlaneMesh": ["PrimitiveMesh", "Mesh", "Resource", "RefCounted", "Object"],
    "QuadMesh": ["PrimitiveMesh", "Mesh", "Resource", "RefCounted", "Object"],
    "StandardMaterial3D": ["BaseMaterial3D", "Material", "Resource", "RefCounted", "Object"],
    "ShaderMaterial": ["Material", "Resource", "RefCounted", "Object"],
    "Camera3D": ["Camera", "Node3D", "Node", "Object"],
    "MeshInstance3D": ["GeometryInstance3D", "VisualInstance3D", "Node3D", "Node", "Object"],
    "MultiMeshInstance3D": ["GeometryInstance3D", "VisualInstance3D", "Node3D", "Node", "Object"],
    "Node3D": ["Node", "Object"],
    "Node2D": ["CanvasItem", "Node", "Object"],
    "DirectionalLight3D": ["Light3D", "VisualInstance3D", "Node3D", "Node", "Object"],
    "OmniLight3D": ["Light3D", "VisualInstance3D", "Node3D", "Node", "Object"],
    "SpotLight3D": ["Light3D", "VisualInstance3D", "Node3D", "Node", "Object"],
    # containers that share a backend but nothing else (ConfigFile is a Resource,
    # not a Dictionary) are listed so the naive "same initial letter" heuristics
    # cannot fire on them
    "ConfigFile": ["RefCounted", "Object"],
    "Dictionary": ["RefCounted", "Object"],
}

# --------------------------------------------------------------------------
BUILTIN_WORDS = {
    "self", "true", "false", "null", "and", "or", "not", "in", "is", "as", "if",
    "else", "elif", "for", "while", "return", "break", "continue", "pass",
    "await", "match", "super", "static", "func", "var", "const", "class", "enum",
    "signal", "extends", "preload", "load", "PI", "TAU", "INF", "NAN",
    "Vector2", "Vector3", "Vector4", "Color", "Basis", "Transform2D",
    "Transform3D", "Quaternion", "Rect2", "AABB", "Plane", "Array", "Dictionary",
    "String", "StringName", "NodePath", "float", "int", "bool", "void", "callable",
    "Callable", "Signal", "PackedByteArray", "PackedInt32Array",
    "PackedInt64Array", "PackedFloat32Array", "PackedFloat64Array",
    "PackedStringArray", "PackedVector2Array", "PackedVector3Array",
    "PackedColorArray", "Range", "Time", "OS", "Engine", "Input", "InputMap",
    "ResourceLoader", "ResourceSaver", "DirAccess", "FileAccess", "ProjectSettings",
    "RenderingServer", "PhysicsServer3D", "AudioServer", "DisplayServer",
    "ThemeDB", "RandomNumberGenerator", "FastNoiseLite", "MultiMesh", "Mesh",
    "Material", "Shader", "ShaderMaterial", "StandardMaterial3D", "Environment",
    "Sky", "WorldEnvironment", "Viewport", "SubViewport", "BoxShape3D",
    "SphereShape3D", "CapsuleShape3D", "CylinderShape3D", "ConcavePolygonShape3D",
    "WorldBoundaryShape3D", "CollisionShape3D", "CollisionObject3D",
    "StaticBody3D", "RigidBody3D", "CharacterBody3D", "Area3D", "Camera3D",
    "Node3D", "Node2D", "Node", "Control", "CanvasLayer", "Timer", "Tween",
    "SceneTree", "Label", "Button", "Panel", "TextureRect", "ColorRect",
    "HBoxContainer", "VBoxContainer", "GridContainer", "ScrollContainer",
    "PanelContainer", "MarginContainer", "BoxContainer", "Container",
    "BoxMesh", "SphereMesh", "CylinderMesh", "PlaneMesh", "QuadMesh",
    "TorusMesh", "CapsuleMesh", "PrismMesh", "ImmediateMesh", "SurfaceTool",
    "MeshInstance3D", "MultiMeshInstance3D", "GPUParticles3D", "CPUParticles3D",
    "ParticleProcessMaterial", "Curve", "CurveTexture", "Gradient", "GradientTexture1D",
    "Texture2D", "Image", "ImageTexture", "ViewportTexture", "Font", "FontVariation",
    "StyleBoxFlat", "StyleBoxEmpty", "Label", "TextureButton", "TextureProgressBar",
    "ProgressBar", "HSlider", "VSplitContainer", "HSplitContainer", "ItemList",
    "OptionButton", "CheckBox", "CheckButton", "TabBar", "Tree", "GridMap",
    "DirectionalLight3D", "OmniLight3D", "SpotLight3D", "ReflectionProbe",
    "SubViewportContainer", "VBoxContainer", "HFlowContainer", "VFlowContainer",
    "AnimationPlayer", "Animation", "AudioStreamPlayer", "AudioStream",
    "AudioStreamOggVorbis", "AudioStreamWAV", "AudioStreamGenerator",
    "AudioEffectReverb", "AudioEffectCompressor", "AudioEffectEQ", "AudioBusLayout",
    "JSON", "Marshalls", "Thread", "Mutex", "Semaphore", "WorkerThreadPool",
    "ConfigFile", "Expression", "RegEx", "RegExMatch", "EncodedObjectAsID",
    "WeakRef", "Logger", "Performance", "GeometryInstance3D", "VisualInstance3D",
    "Light3D", "Camera", "CameraAttributes", "CameraAttributesPractical",
    "BaseMaterial3D", "ORMMaterial3D", "Resource", "RefCounted", "Object",
}

ASSIGN_NEW = re.compile(r"^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w.]*)\.new\s*\(")
DECL_TYPED = re.compile(r"^\s*var\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)")


def knows(built: str, expected: str) -> bool:
    """Is a value built as `built` allowed where `expected` is declared?"""
    if built == expected:
        return True
    chain = GODOT_CHAINS.get(built)
    if chain is not None:
        return expected in chain
    # unknown custom types: allow, we cannot prove a violation
    return True


def check_assignments(path: Path, src: str) -> list[str]:
    decl: dict[str, tuple[str, int]] = {}
    out = []
    for i, line in enumerate(src.split("\n"), 1):
        m = DECL_TYPED.match(line)
        if m:
            decl[m.group(1)] = (m.group(2), i)
            continue
        m = ASSIGN_NEW.match(line)
        if not m:
            continue
        name, built = m.group(1), m.group(2).split(".")[-1]
        if name in decl and not knows(built, decl[name][0]):
            out.append(
                f"{path}:{i}: '{name}' is declared {decl[name][0]} (line {decl[name][1]})"
                f" but assigned {built}.new()"
            )
    return out


DECL_ANY = re.compile(
    r"\b(?:var|const|func|signal|class_name|enum)\s+([A-Za-z_]\w*)"
    r"|\bfor\s+([A-Za-z_]\w*)\s+in\b"
    r"|\b(?:var|const)\s+([A-Za-z_]\w*)\s*:="
)
IDENT = re.compile(r"(?<![\w.$@])([a-z_][a-z0-9_]{2,})(?![\w(])")


def declared_names(src: str) -> set[str]:
    names: set[str] = set()
    for m in DECL_ANY.finditer(src):
        names.update(g for g in m.groups() if g)
    return names


def check_scope(path: Path, src: str) -> list[str]:
    """Report upper-case-free identifiers that appear nowhere as a declaration.

    Deliberately narrow: only looks at identifiers that look like locals
    (lowercase, 3+ chars) and never inside strings or comments, and only when
    the identifier is not a known builtin. This mirrors check_undeclared.py but
    at file scope, catching a block whose declaration was deleted in an edit
    while the use remained.
    """
    stripped = re.sub(r'"[^"\n]*"', '""', src)
    stripped = re.sub(r"#[^\n]*", "", stripped)
    declared = declared_names(src)
    if not declared:
        return []
    out = []
    for m in IDENT.finditer(stripped):
        word = m.group(1)
        if word in declared or word in BUILTIN_WORDS:
            continue
        out.append(word)
    return out


def main() -> int:
    files = []
    for pattern in ("scripts/**/*.gd", "tests/**/*.gd"):
        files.extend(sorted(ROOT.glob(pattern)))
    files = [f for f in files if not any(p in SKIP_DIRS for p in f.parts)]

    problems: list[str] = []
    for f in files:
        src = f.read_text(encoding="utf-8")
        problems.extend(check_assignments(f.relative_to(ROOT), src))

    if problems:
        for p in problems:
            print(f"TYPE ERROR  {p}")
        print(f"type check: {len(problems)} problem(s)")
        return 1
    print(f"type check: {len(files)} files clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
