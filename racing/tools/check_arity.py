#!/usr/bin/env python3
"""Fail the build when a call passes the wrong number of arguments.

Why this exists
---------------
`gdparse` checks syntax and `gdlint` checks style; neither resolves a function's
signature. A call with one argument too many is therefore *syntactically valid*,
passes both, and is only rejected by Godot's own parser — after a full CI run
that also builds the APK. That happened: `_hold_inputs(car, speed, steer, ticks)`
was rewritten to `(car, steer, ticks)` while three call sites still passed four,
and the whole test suite failed to load.

Per-class resolution
--------------------
GDScript methods are scoped to a class, and the same name routinely means
different things in different classes (`build()`, `setup()`, `tick()` all appear
in several files with different signatures). A project-wide name table therefore
reported dozens of false arity errors. This gate instead resolves a bare call
against, in order:

  1. the functions declared in the calling file,
  2. the functions declared in its `extends` chain, following a project path,
  3. nothing else.

Autoload and `class_name` calls are written as `Foo.bar(...)` and are matched by
the `(?<![\\w.])` guard in CALL_RE, so they are never checked. That is deliberate:
a missed case is a smaller problem than a false failure that blocks a real build.

Deliberately conservative
-------------------------
* A call is skipped when its argument list cannot be split confidently (an
  unbalanced bracket, a lambda literal), because a wrong split invents errors.
* `func` parameters with a default (`int ticks = 4`) lower the required count and
  raise the maximum, exactly like GDScript.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".godot", "build", "addons"}

FUNC_RE = re.compile(r"^([ \t]*)func[ \t]+([A-Za-z_]\w*)[ \t]*\((.*?)\)", re.S | re.M)
EXTENDS_PATH_RE = re.compile(r'^extends[ \t]+"(res://[^"]+)"', re.M)
CALL_RE = re.compile(r"(?<![\w.])([A-Za-z_]\w*)[ \t]*\(")


def strip_strings_and_comments(src: str) -> str:
    """Blank comments and replace string bodies with an `S` marker.

    Offsets and newlines are preserved so a match position in the cleaned text
    maps to the same line in the original. The string body is *replaced by one
    non-space marker* rather than blanked: a fully blanked body makes
    `_check("a", "b")` look like a call with two empty arguments, which the
    argument splitter then discards, reporting every string call as short.
    """
    out: list[str] = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch == "#":
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if ch in "\"'":
            quote = ch
            triple = src[i:i + 3] == quote * 3
            if triple:
                out.append("   ")
                i += 3
                first = True
                while i < n and src[i:i + 3] != quote * 3:
                    if src[i] == "\n":
                        out.append("\n")
                    else:
                        out.append("S" if first else " ")
                        first = False
                    i += 1
                out.append("   ")
                i += 3
            else:
                out.append(" ")
                i += 1
                first = True
                while i < n and src[i] != quote and src[i] != "\n":
                    out.append("S" if first else " ")
                    first = False
                    i += 1
                if i < n and src[i] == quote:
                    out.append(" ")
                    i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def split_top(text: str, sep: str = ",") -> list[str] | None:
    """Split on `sep` at bracket depth zero. None when depth never closes."""
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in text:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth < 0:
                return None
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if depth != 0:
        return None
    tail = "".join(cur).strip()
    if tail:
        parts.append(tail)
    return [p.strip() for p in parts if p.strip()]


def signature(params: list[str]) -> tuple[int, int]:
    required = sum(1 for p in params if "=" not in p)
    return required, len(params)


def path_of(src_text: str) -> Path | None:
    """The project file this one extends, if it extends by res:// path."""
    m = EXTENDS_PATH_RE.search(src_text)
    if not m:
        return None
    rel = m.group(1).removeprefix("res://")
    candidate = (ROOT / rel).resolve()
    return candidate if candidate.is_file() else None


def functions_of(path: Path) -> dict[str, tuple[int, int]]:
    cleaned = strip_strings_and_comments(path.read_text(encoding="utf-8"))
    table: dict[str, tuple[int, int]] = {}
    for m in FUNC_RE.finditer(cleaned):
        name = m.group(2)
        if name in ("_init", "_static_init"):
            continue
        table.setdefault(name, signature(split_top(m.group(3)) or []))
    return table


def scope_for(path: Path, cache: dict[Path, dict[str, tuple[int, int]]]) -> dict[str, tuple[int, int]]:
    """Functions visible to a bare call in `path`: own, then up the extends chain."""
    scope: dict[str, tuple[int, int]] = {}
    seen: set[Path] = set()
    cur: Path | None = path
    while cur is not None and cur not in seen:
        seen.add(cur)
        if cur not in cache:
            cache[cur] = functions_of(cur)
        for name, sig in cache[cur].items():
            scope.setdefault(name, sig)
        text = cur.read_text(encoding="utf-8")
        cur = path_of(text)
    return scope


def balanced_call(cleaned: str, open_idx: int) -> str | None:
    depth = 0
    i = open_idx
    n = len(cleaned)
    while i < n:
        ch = cleaned[i]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                return cleaned[open_idx + 1:i]
        i += 1
    return None


def check_file(path: Path, cache: dict[Path, dict[str, tuple[int, int]]]) -> list[str]:
    scope = scope_for(path, cache)
    if not scope:
        return []
    cleaned = strip_strings_and_comments(path.read_text(encoding="utf-8"))
    problems: list[str] = []
    for m in CALL_RE.finditer(cleaned):
        name = m.group(1)
        if name not in scope:
            continue
        # skip the declaration itself
        line_start = cleaned.rfind("\n", 0, m.start()) + 1
        if cleaned[line_start:m.start()].lstrip().startswith("func"):
            continue
        req, mx = scope[name]
        inner = balanced_call(cleaned, m.end() - 1)
        if inner is None:
            continue
        args = split_top(inner)
        if args is None:
            continue
        if any(a.startswith("func(") or a.startswith("func (") for a in args):
            continue
        got = len(args)
        if got < req or got > mx:
            line = cleaned.count("\n", 0, m.start()) + 1
            expected = f"{req}" if req == mx else f"{req}..{mx}"
            problems.append(
                f"{path.relative_to(ROOT)}:{line}: {name}() takes {expected} "
                f"argument(s), call passes {got}"
            )
    return problems


def main() -> int:
    files = [
        p for p in sorted(ROOT.rglob("*.gd"))
        if not any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts)
    ]
    if not files:
        print("arity check: no .gd files found", file=sys.stderr)
        return 1
    cache: dict[Path, dict[str, tuple[int, int]]] = {}
    problems: list[str] = []
    for path in files:
        problems.extend(check_file(path, cache))
    if problems:
        print("arity check FAILED:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1
    resolved = sum(len(v) for v in cache.values())
    print(f"arity check: {len(files)} file(s) clean, {len(cache)} class scope(s), "
          f"{resolved} function(s) resolved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
