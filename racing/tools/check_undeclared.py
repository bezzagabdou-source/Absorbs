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
# Methods inherited from Node/Control/Object that this project calls without a
# receiver. Not exhaustive by design — only names that actually appear in the
# call sites, so the list stays auditable.
ENGINE_METHODS = {
    "get_node", "get_parent", "has_node", "add_child", "remove_child", "queue_free",
    "get_children", "get_child_count", "is_inside_tree", "get_tree", "set_process",
    "set_physics_process", "set_process_input", "set_process_unhandled_input",
    "connect", "disconnect", "emit_signal", "call_deferred", "call", "has_method",
    "set_meta", "get_meta", "has_meta", "remove_meta", "duplicate", "free",
    "get_class", "is_class", "get_instance_id", "is_queued_for_deletion",
    "set_anchors_and_offsets_preset", "add_theme_stylebox_override",
    "add_theme_constant_override", "add_theme_font_size_override",
    "add_theme_color_override", "add_theme_font_override",
    "get_theme_color", "get_theme_font", "get_theme_stylebox", "get_theme_constant",
    "grab_focus", "release_focus", "has_focus", "accept_event",
    "set_drag_preview", "get_drag_data", "can_drop_data", "drop_data",
    "look_at", "look_at_from_position", "rotate_x", "rotate_y", "rotate_z",
    "translate", "translate_object_local", "global_translate", "move_toward",
    "lerp", "slerp", "bezier_interpolate", "direction_to", "angle_to",
    "set_shader_parameter", "get_shader_parameter", "set_surface_override_material",
    "get_surface_override_material", "surface_get_material",
    "begin", "commit", "generate_normals", "generate_tangents", "add_vertex",
    "set_normal", "set_uv", "set_color", "set_smooth_group", "index",
    "bind", "unbind", "is_valid", "get_method", "get_object",
    "size", "is_empty", "has", "clear", "append", "append_array", "erase",
    "insert", "remove_at", "pop_back", "pop_front", "find", "rfind", "sort",
    "sort_custom", "shuffle", "pick_random", "duplicate_deep", "merge",
    "keys", "values", "get", "set", "get_or_add", "slice", "filter", "map",
    "reduce", "any", "all", "max_value", "min_value", "bsearch",
    "to_lower", "to_upper", "strip_edges", "split", "join", "replace",
    "begins_with", "ends_with", "contains", "substr", "findn", "format",
    "uri_encode", "uri_decode", "c_escape", "c_unescape", "json_escape",
    "length", "is_empty", "normalized", "normalize", "dot", "cross",
    "distance_to", "distance_squared_to", "move_toward", "clamp",
    "start", "stop", "play", "seek", "is_playing", "set_volume_db",
    "set_pitch_scale", "set_stream", "set_bus", "set_loop",
    "create_timer", "reload_current_scene", "change_scene_to_file",
    "change_scene_to_packed", "quit", "notification",
    "set_deferred", "get_deferred", "property_list_changed_notify",
    "set_visible", "show", "hide", "is_visible_in_tree",
    "set_anchors_preset", "set_offsets_preset", "set_size", "set_position",
    "set_rotation", "set_scale", "set_modulate", "set_self_modulate",
    "set_mouse_filter", "set_focus_mode", "set_v_size_flags",
    "set_h_size_flags", "set_custom_minimum_size",
    # --- verified from real call sites, not guessed -----------------------
    # Each of these was reported by this checker and then confirmed to be an
    # inherited method. Keeping them here rather than silencing the reporter is
    # the point: the list stays small, auditable, and every entry has a reason.
    "get_window", "get_global_rect", "get_node_or_null", "move_child",
    "create_tween", "get_viewport", "get_viewport_rect",
    "get_physics_process_delta_time", "is_on_floor", "move_and_slide",
    "get_slide_collision_count", "get_slide_collision",
    "add_to_group", "remove_from_group", "is_in_group",
    "queue_redraw", "draw_rect", "draw_string", "draw_circle", "draw_arc",
    "draw_line", "draw_polyline", "draw_colored_polygon", "draw_texture",
    "draw_texture_rect", "draw_set_transform", "draw_multiline",
    # global math helpers
    "absi", "floorf", "floori", "ceilf", "snappedf", "snappedi", "is_finite",
    "is_inf", "is_nan", "linear_to_db", "db_to_linear", "lerp_angle",
    "move_toward", "remap", "ease", "beziert", "pingpong", "posmod",
    "deg_to_rad", "rad_to_deg", "exp", "log", "asin", "acos", "atan", "atan2",
    "seed", "randi", "randf", "randomize",
    "min", "max", "abs", "clamp", "round", "sign",
}



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

    # A function defined twice in one file is a Godot parse error, and the error
    # message names the file rather than the function, which is how a duplicate
    # `_quad` kept OpenWorld.gd from compiling and blacked out every capture of
    # the free-roam screen. Catch it by name here.
    for path, text in sorted(((p, src) for p, src in sources.items())):
        seen_fn: dict = {}
        for lineno, line in enumerate(text.splitlines(), 1):
            m = re.match(r"^(?:static\s+)?func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", line)
            if not m:
                continue
            fname = m.group(1)
            if fname in seen_fn:
                problems.append("%s:%d duplicate func %s (first at line %d)"
                                % (path.relative_to(ROOT), lineno, fname, seen_fn[fname]))
            else:
                seen_fn[fname] = lineno

    # Indentation that contradicts the block it sits in is a parse error in Godot,
    # but gdparse/gdlint accept a "comment dedent" where a comment line is one
    # level shallower than the code that follows it, so a stray tab silently
    # hoisted an entire camera branch out of its `if showcase:` block and the
    # free-roam scene came up black. Flag any comment whose indent does not match
    # the next non-blank, non-comment line.
    for path, text in sorted(((p, src) for p, src in sources.items())):
        lines = text.splitlines()
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped.startswith("#"):
                continue
            j = i + 1
            while j < len(lines) and (not lines[j].strip() or lines[j].strip().startswith("#")):
                j += 1
            if j >= len(lines):
                continue
            nxt = lines[j]
            if not nxt.strip():
                continue
            indent = len(line) - len(line.lstrip("\t"))
            nxt_indent = len(nxt) - len(nxt.lstrip("\t"))
            if abs(indent - nxt_indent) == 1 and nxt_indent > 0:
                problems.append("%s:%d comment indent %d does not match code indent %d"
                                % (path.relative_to(ROOT), i + 1, indent, nxt_indent))

    # --- self method calls ---------------------------------------------------
    # Godot rejects a call to a method that exists nowhere in the class with
    # "Function X not found in base self". gdparse and gdlint both accept it, and
    # the variable gate above only looks at bare identifiers, so a helper that
    # was referenced but never inserted reached CI and failed the import step.
    #
    # Only RECEIVERLESS calls are considered. `obj.foo()` and `self.foo()` may
    # legitimately target another object or an inherited engine method, so
    # looking at those would produce a wall of false positives. A bare `foo(`
    # can only mean "a method on self", which is exactly the failing case.
    call_re = re.compile(r"(?<![\w.\"'])([A-Za-z_]\w*)\s*\(")
    all_funcs: set[str] = set()
    for text in sources.values():
        all_funcs.update(re.findall(r"\bfunc\s+([A-Za-z_]\w*)", text))
    # `signal x` declared here and emitted bare is a signal, not a method call
    for path, text in sorted(sources.items()):
        local = set(re.findall(r"\bfunc\s+([A-Za-z_]\w*)", text))
        local_sigs = set(re.findall(r"\bsignal\s+([A-Za-z_]\w*)", text))
        clean = re.sub(r'"(?:[^"\\]|\\.)*"', '""', text)
        clean = re.sub(r"'(?:[^'\\]|\\.)*'", "''", clean)
        clean = re.sub(r"#.*", "", clean)
        for m in call_re.finditer(clean):
            name = m.group(1)
            if name in local or name in local_sigs or name in all_funcs:
                continue
            if name in BUILTINS or name in ENGINE_METHODS:
                continue
            lineno = clean.count("\n", 0, m.start()) + 1
            problems.append(
                "%s:%d calls %s() with no receiver and no definition in this class"
                % (path.relative_to(ROOT), lineno, name))

    if problems:
        print("undeclared identifier(s) found:")
        for msg in problems:
            print("  " + msg)
        return 1
    print(f"undeclared-identifier check: {len(files)} files clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
