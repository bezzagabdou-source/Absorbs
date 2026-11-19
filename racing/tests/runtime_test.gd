extends SceneTree
## Boots the real game scene and drives every screen for a few frames each,
## plus a scripted race on every track. Catches runtime errors the parse test
## cannot: missing nodes, bad signal wiring, null data, layout crashes.
##
## Run: godot --headless --path . --script res://tests/runtime_test.gd

var failures = 0
var checks = 0


func _check(cond: bool, label: String) -> void:
	checks += 1
	if cond:
		print("[RUNTIME] PASS ", label)
	else:
		failures += 1
		printerr("[RUNTIME] FAIL ", label)


func _initialize() -> void:
	await process_frame
	print("[RUNTIME] ==== BOOT ====")
	var main = load("res://scenes/Main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	_check(main != null, "main scene instantiates")
	await _tick(6)
	_check(SceneRouter.current_id == "boot", "boot screen opens")
	await _tick(120)
	_check(SceneRouter.current_id == "menu", "boot transitions to menu")

	var screens = ["tracks", "garage", "shop", "achievements", "daily", "settings",
		"credits", "profile"]
	for id in screens:
		SceneRouter.goto_instant(id)
		await _tick(4)
		_check(SceneRouter.current_id == id, "screen %s loads" % id)
		_check(SceneRouter.current != null, "screen %s builds a Control" % id)

	await _race_all_tracks()
	print("[RUNTIME] ==== %d checks, %d failures ====" % [checks, failures])
	if failures > 0:
		printerr("[RUNTIME] RESULT: FAIL")
		quit(1)
	else:
		print("[RUNTIME] RESULT: PASS")
		quit(0)


func _tick(n: int) -> void:
	for i in range(n):
		await process_frame


func _race_all_tracks() -> void:
	print("[RUNTIME] SECTION races")
	for track in GameData.TRACKS:
		SceneRouter.goto_instant("race", {"track": track, "mode": "circuit"})
		await _tick(3)
		var scr: Control = SceneRouter.current
		_check(scr != null, "race %s screen built" % str(track["id"]))
		if scr == null:
			continue
		await _tick(80)
		var player = scr.get("player")
		_check(player != null, "race %s spawned player" % str(track["id"]))
		var ai: Array = scr.get("ai_cars")
		_check(ai.size() == 5, "race %s spawned 5 opponents" % str(track["id"]))
		if player:
			_check(player.is_on_floor() or player.global_position.y > -20.0,
				"race %s player not in the void" % str(track["id"]))
		scr.queue_free()
		await _tick(2)
