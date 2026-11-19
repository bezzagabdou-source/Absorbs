extends SceneTree
## Loads every script in the project (compiling it for real, not just parsing)
## and reports each failure individually so CI annotations point at the file.
##
## Run: godot --headless --path . --script res://tests/compile_check.gd [-- file.gd ...]

var failures := 0
var checked := 0


func _initialize() -> void:
	var only: Array = OS.get_cmdline_user_args()
	var targets: Array = []
	if only.is_empty():
		for d in ["res://scripts/autoload/", "res://scripts/vehicle/", "res://scripts/race/",
				"res://scripts/ui/", "res://scripts/ui/screens/", "res://scripts/", "res://tests/"]:
			var dir := DirAccess.open(d)
			if dir == null:
				continue
			for f in dir.get_files():
				if f.ends_with(".gd"):
					targets.append(d + f)
	else:
		targets = only
	for path in targets:
		checked += 1
		var res = load(path)
		if res == null:
			failures += 1
			print("[COMPILE] FAIL ", path)
		else:
			print("[COMPILE] ok ", path)
	print("[COMPILE] %d scripts, %d failed" % [checked, failures])
	quit(1 if failures > 0 else 0)
