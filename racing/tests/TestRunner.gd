extends Node
## Scene-based test runner. Runs as a real scene so autoloads (GameData, Game,
## SettingsStore, AudioDirector, UIStyle, SceneRouter, Localization) exist,
## exactly like the shipped game. Exits with a non-zero code on failure.
##
## Godot --headless --path racing res://tests/TestRunner.tscn -- [--quick]

var failures: int = 0
var checks: int = 0
var _quick := false


func _ready() -> void:
	_quick = OS.get_cmdline_user_args().has("--quick")
	await get_tree().process_frame
	print("[SUITE] ==== APEX VELOCITY TEST SUITE ====")
	await _foundation()
	if not _quick:
		await _runtime()
	print("[SUITE] ==== %d checks, %d failures ====" % [checks, failures])
	if failures > 0:
		printerr("[SUITE] RESULT: FAIL")
		get_tree().quit(1)
	else:
		print("[SUITE] RESULT: PASS")
		get_tree().quit(0)


func _check(cond: bool, label: String) -> void:
	checks += 1
	if cond:
		print("[TEST] PASS ", label)
	else:
		failures += 1
		printerr("[TEST] FAIL ", label)


func _frames(n: int) -> void:
	for i in range(n):
		await get_tree().process_frame


func _foundation() -> void:
	print("[SUITE] SECTION scripts")
	for d in ["res://scripts/autoload/", "res://scripts/vehicle/", "res://scripts/race/",
			"res://scripts/ui/", "res://scripts/ui/screens/"]:
		var dir := DirAccess.open(d)
		if dir == null:
			_check(false, "directory " + d)
			continue
		for f in dir.get_files():
			if f.ends_with(".gd"):
				_check(load(d + f) != null, "parse " + f)

	print("[SUITE] SECTION data")
	_check(GameData.CARS.size() == 32, "32 cars")
	_check(GameData.TRACKS.size() >= 8, "8+ tracks")
	_check(GameData.ACHIEVEMENTS.size() >= 20, "20+ achievements")
	_check(GameData.PAINTS.size() >= 16, "16+ paints")
	_check(GameData.RIMS.size() >= 5, "5+ rims")
	var classes: Dictionary = {}
	for car in GameData.CARS:
		classes[str(car["class"])] = int(classes.get(str(car["class"]), 0)) + 1
		_check(GameData.SHAPES.has(str(car["body"])), "shape for " + str(car["id"]))
	_check(classes.size() == 4, "4 classes")
	for k in classes.keys():
		_check(int(classes[k]) == 8, "8 cars in " + str(k))

	print("[SUITE] SECTION physics")
	for cls in ["street", "sport", "super", "hyper"]:
		var car: Dictionary = {}
		for c in GameData.CARS:
			if str(c["class"]) == cls:
				car = c
				break
		var p: Dictionary = GameData.physics_for(car, {})
		_check(float(p["top_speed_ms"]) > 40.0, cls + " top speed")
		_check(float(p["accel"]) > 3.0, cls + " accel")
		_check(float(p["grip"]) > 0.7 and float(p["grip"]) <= 1.0, cls + " grip")
	var tuned: Dictionary = GameData.physics_for(GameData.CARS[0], {"engine": 5, "tires": 5, "turbo": 5})
	var stock: Dictionary = GameData.physics_for(GameData.CARS[0], {})
	_check(float(tuned["top_speed_ms"]) > float(stock["top_speed_ms"]), "upgrades raise top speed")

	print("[SUITE] SECTION profile")
	_check(Game.level() >= 1, "level 1+")
	_check(Game.owned_count() >= 1, "starter car owned")
	_check(Game.selected_car() != {}, "selected car resolves")
	_check(Game.format_credits(15000) != "", "credit formatting")

	print("[SUITE] SECTION tracks")
	var TrackLib = load("res://scripts/race/TrackLibrary.gd")
	for track in GameData.TRACKS:
		var td = TrackLib.for_track(track)
		_check(td.points.size() == 1201, "1201 points " + str(track["id"]))
		_check(td.total_length > 800.0, "length > 800m " + str(track["id"]))
		var s: Dictionary = td.sample_distance(td.total_length * 0.5)
		_check(s.has("pos") and s.has("tan"), "sampling " + str(track["id"]))
		var prj: Dictionary = td.project(td.points[10])
		_check(int(prj["index"]) >= 0, "projection " + str(track["id"]))
	_check(TrackLib.cache_store.size() == GameData.TRACKS.size(), "cache filled")

	print("[SUITE] SECTION car models")
	var CarModel = load("res://scripts/vehicle/CarModel.gd")
	var kinds: Array = ["hatch", "sedan", "coupe", "muscle", "sport", "super", "hyper"]
	for kind in kinds:
		var info: Dictionary = {"id": "t", "name": "T", "class": "sport", "body": kind,
			"color": "22e9ff", "paint": "cyan"}
		var model = CarModel.new()
		add_child(model)
		model.build(info, "cyan", "stock")
		_check(model.wheels.size() == 4, "4 wheels " + str(kind))
		model.steer_wheels(0.2, 1.0)
		model.set_brake(true)
		model.set_nitro(true, 0.5)
		model.set_damage(0.3)
		model.queue_free()

	print("[SUITE] SECTION screens (instantiate)")
	for id in ["menu", "tracks", "garage", "shop", "achievements", "daily",
			"settings", "credits", "profile", "results"]:
		var scr = load("res://scripts/ui/screens/%s.gd" % id)
		_check(scr != null, "screen script " + id)


func _runtime() -> void:
	print("[SUITE] SECTION runtime boot")
	var main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	await _frames(4)
	_check(main != null, "main scene instantiates")
	await _frames(8)
	_check(SceneRouter.current_id == "boot", "boot screen opens")
	await get_tree().create_timer(3.0).timeout
	_check(SceneRouter.current_id == "menu", "boot -> menu")

	for id in ["tracks", "garage", "shop", "achievements", "daily", "settings",
			"credits", "profile"]:
		SceneRouter.goto_instant(id)
		await _frames(5)
		_check(SceneRouter.current_id == id, "screen " + id + " loads")
		_check(SceneRouter.current != null, "screen " + id + " builds")

	print("[SUITE] SECTION runtime races")
	for track in GameData.TRACKS:
		SceneRouter.goto_instant("race", {"track": track, "mode": "circuit"})
		await _frames(4)
		var scr: Node = SceneRouter.current
		_check(scr != null, "race built " + str(track["id"]))
		if scr == null:
			continue
		await _frames(90)
		var player = scr.get("player")
		var ai: Array = scr.get("ai_cars")
		_check(player != null, "player spawned " + str(track["id"]))
		_check(ai.size() == 5, "5 opponents " + str(track["id"]))
		if player != null:
			_check(player.global_position.y > -25.0, "player above void " + str(track["id"]))
			_check(player.speed_kmh() >= 0.0, "speed readable " + str(track["id"]))
		if SceneRouter.current != null:
			SceneRouter.current.queue_free()
		await _frames(2)
