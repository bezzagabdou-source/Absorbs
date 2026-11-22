#!/usr/bin/env python3
"""Static checks for the Godot shading language that the GLSL compiler rejects.

The terrain shader declared a mutable global (`vec3 road_emission = vec3(0.0);`).
Godot only permits uniforms, varyings, constants and functions at file scope, so
the whole shader failed to compile, the material fell back to a default, and the
screenshot looked like "the road is drawn in the wrong place" for several rounds.
The CI shader probe does catch this, but it costs a full job; this is instant.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_GLOBAL = ("uniform", "varying", "const", "shader_type", "render_mode",
                  "include", "group_uniforms", "instance", "global", "struct",
                  "//", "/*", "*", "#")


def check(path: Path) -> list[str]:
    problems: list[str] = []
    depth = 0
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    for lineno, raw in enumerate(raw_lines, 1):
        line = raw.split("//")[0].rstrip()
        if not line.strip():
            depth += raw.count("{") - raw.count("}")
            continue
        if depth == 0:
            stripped = line.strip()
            first = stripped.split()[0] if stripped.split() else ""
            # A function definition is a name followed by "(" and then "{"; anything
            # else at file scope is a variable, which Godot rejects unless it is a
            # uniform/varying/const.
            if re.match(r"^[A-Za-z_][A-Za-z0-9_<>,\[\] ]*\s+[A-Za-z_][A-Za-z0-9_]*\s*\(",
                        stripped):
                depth += line.count("{") - line.count("}")
                continue
            if first and not first.startswith(ALLOWED_GLOBAL):
                problems.append(
                    "%s:%d mutable declaration at file scope: %s"
                    % (path.relative_to(ROOT), lineno, stripped[:70]))
            # one-line function bodies open and close on the same line
            if "(" in stripped and ")" in stripped:
                depth += line.count("{") - line.count("}")
                continue
        depth += line.count("{") - line.count("}")
        if depth < 0:
            problems.append("%s:%d unbalanced braces" % (path.relative_to(ROOT), lineno))
            depth = 0
    if depth != 0:
        problems.append("%s: %d unclosed brace(s) at end of file"
                        % (path.relative_to(ROOT), depth))
    return problems


def main() -> int:
    files = sorted(ROOT.glob("shaders/*.gdshader"))
    problems: list[str] = []
    for f in files:
        problems.extend(check(f))
    if problems:
        print("shader problems:")
        for p in problems:
            print("  " + p)
        return 1
    print("shader-scope check: %d file(s) clean" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
