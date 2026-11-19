extends SceneTree
## Headless gameplay smoke test: parses every script, boots the actual game scene,
## and asserts the core systems came up. Run by CI on every push before APK export.

var failures: int = 0

func _check(condition: bool, label: String) -> void:
	if condition:
		print("[SMOKE] PASS ", label)
	else:
		printerr("[SMOKE] FAIL ", label)
		failures += 1

func _initialize() -> void:
	var scripts := [
		"res://scripts/core/Main.gd", "res://scripts/core/EventBus.gd", "res://scripts/core/GameData.gd",
		"res://scripts/core/Quality.gd", "res://scripts/core/SaveSystem.gd",
		"res://scripts/player/InputManager.gd", "res://scripts/player/PlayerController.gd", "res://scripts/player/CameraRig.gd",
		"res://scripts/vehicles/VehicleController.gd", "res://scripts/weapons/WeaponSystem.gd",
		"res://scripts/ai/TrafficAI.gd", "res://scripts/ai/PedestrianAI.gd", "res://scripts/ai/PoliceAI.gd",
		"res://scripts/ai/GangAI.gd", "res://scripts/world/RoadGraph.gd", "res://scripts/world/ProceduralCity.gd",
		"res://scripts/world/DayNight.gd", "res://scripts/world/Weather.gd", "res://scripts/missions/MissionRunner.gd",
		"res://scripts/economy/Economy.gd", "res://scripts/localization/Localization.gd",
		"res://scripts/ui/UIManager.gd", "res://scripts/ui/Minimap.gd", "res://scripts/ui/VirtualJoystick.gd",
	]
	for path in scripts:
		var res: Resource = load(path)
		_check(res != null, "parse " + path.get_file())
	var d := SaveSystem.default_data()
	_check(int(d["money"]) == 500, "save default money")
	SaveSystem.save(d)
	var loaded := SaveSystem.load_data()
	_check(int(loaded["money"]) == 500, "encrypted save roundtrip")
	_check(SaveSystem.has_save(), "save file exists")
	var g := RoadGraph.new()
	g.build()
	_check(g.size() == 441, "road graph 21x21 nodes")
	_check(GameData.DISTRICTS.size() == 6, "six districts")
	_check(GameData.VEHICLES.size() == 10, "ten vehicles")
	_check(GameData.WEAPONS.size() == 8, "eight weapons")
	var scene: PackedScene = load("res://scenes/Main.tscn")
	_check(scene != null, "main scene resource")
	if scene == null:
		quit(1)
		return
	var main := scene.instantiate()
	root.add_child(main)
	for i in range(24):
		await process_frame
	_check(main.get("graph") != null, "world graph booted")
	_check(main.get("city") != null and int(main.get("city").chunk_count()) > 0, "city chunks generated")
	_check(main.get("player") != null, "player booted")
	_check(main.get("ui") != null, "UI booted")
	_check(main.get("police") != null, "police system booted")
	_check(main.get("missions") != null and int(main.get("missions").mission_count()) == 9, "9 missions registered")
	main.queue_free()
	for i in range(6):
		await process_frame
	if failures > 0:
		printerr("[SMOKE] %d failures" % failures)
		quit(1)
	else:
		print("[SMOKE] ALL CHECKS PASSED")
		quit(0)
