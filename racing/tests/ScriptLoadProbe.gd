extends Node
## Loads every GDScript in the project and reports the ones Godot cannot compile.
##
## This exists because a single stale identifier in one screen (a `fwd` that had
## been renamed) silently failed the whole screen: Godot logged "Parse Error" and
## the scene came up empty, so every capture of that screen was a black frame and
## the failure looked like a rendering bug. `gdparse` cannot see it either — it
## parses syntax, not name resolution — and the headless suite only instantiates
## the screens it knows about.
##
## Runs from CI as: godot --headless --path racing res://tests/ScriptLoadProbe.tscn

const SKIP_DIRS := ["assets", "docs", "build", ".godot"]


func _ready() -> void:
	var files: PackedStringArray = PackedStringArray()
	_walk("res://", files)
	var bad: Array[String] = []
	for f in files:
		var res = load(f)
		if res == null:
			bad.append(f)
			continue
		# a script that failed to compile still returns a GDScript object, but
		# reload() reports the failure
		if res is GDScript and not (res as GDScript).can_instantiate() \
				and not ((res as GDScript).is_abstract()):
			bad.append(f)
	print("[SCRIPTS] checked=%d failed=%d" % [files.size(), bad.size()])
	for b in bad:
		print("[SCRIPTS] FAIL %s" % b)
	get_tree().quit(1 if bad.size() > 0 else 0)


func _walk(dir_path: String, out: PackedStringArray) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if entry.begins_with("."):
			entry = dir.get_next()
			continue
		var full := dir_path.path_join(entry)
		if dir.current_is_dir():
			if not SKIP_DIRS.has(entry):
				_walk(full, out)
		elif entry.ends_with(".gd"):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
