extends SceneTree

func _init() -> void:
	var scene: PackedScene = load("res://scenes/Main.tscn")
	if scene == null:
		printerr("[SMOKE] cannot load Main.tscn")
		quit(1)
		return
	var inst := scene.instantiate()
	if inst == null:
		printerr("[SMOKE] cannot instantiate Main")
		quit(1)
		return
	inst.free()
	print("[SMOKE] Main scene instantiates")
	quit(0)
