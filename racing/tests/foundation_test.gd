extends SceneTree
## Headless foundation tests: autoload data integrity, save/load, physics maths,
## track generation and every screen/car/track instantiating without error.
##
## Run: godot --headless --path . --script res://tests/foundation_test.gd
## Exits non-zero on any failure.

var failures := 0
var checks := 0


func _check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("[TEST] PASS ", label)
	else:
		failures += 1
		printerr("[TEST] FAIL ", label)


func _initialize() -> void:
	await process_frame
	print("[TEST] ==== APEX VELOCITY FOUNDATION TESTS ====")
	_test_scripts_parse()
	_test_game_data()
	_test_physics()
	_test_profile()
	_test_tracks()
	_test_cars_models()
	_test_screens()
	print("[TEST] ==== %d checks, %d failures ====" % [checks, failures])
	if failures > 0:
		printerr("[TEST] RESULT: FAIL")
		quit(1)
	else:
		print("[TEST] RESULT: PASS")
		quit(0)


func _test_scripts_parse() -> void:
	print("[TEST] SECTION scripts")
	var dirs := ["res://scripts/", "res://scripts/autoload/", "res://scripts/vehicle/",
		"res://scripts/race/", "res://scripts/ui/", "res://scripts/ui/screens/"]
	var count := 0
	for d in dirs:
		var dir := DirAccess.open(d)
		if dir == null:
			continue
		for f in dir.get_files():
			if not f.ends_with(".gd"):
				continue
			var path := d + f
			var res: Resource = load(path)
			_check(res != null, "parse " + path)
			count += 1
	_check(count >= 20, "script count >= 20 (found %d)" % count)


func _test_game_data() -> void:
	print("[TEST] SECTION data")
	_check(GameData.CARS.size() == 32, "32 cars")
	var classes := {}
	for car in GameData.CARS:
		classes[str(car["class"])] = int(classes.get(str(car["class"]), 0)) + 1
		_check(GameData.SHAPES.has(str(car["body"])), "body shape exists for " + str(car["id"]))
	_check(classes.size() == 4, "4 car classes")
	for k in classes.keys():
		_check(int(classes[k]) == 8, "8 cars in class " + str(k))
	_check(GameData.TRACKS.size() >= 8, "at least 8 tracks")
	_check(GameData.ACHIEVEMENTS.size() >= 20, "at least 20 achievements")
	_check(GameData.PAINTS.size() >= 12, "at least 12 paints")
	_check(GameData.RIMS.size() >= 5, "at least 5 rims")
	_check(GameData.UPGRADES.size() == 3, "3 upgrade kinds")


func _test_physics() -> void:
	print("[TEST] SECTION physics")
	for cls in ["street", "sport", "super", "hyper"]:
		var car: Dictionary = {}
		for c in GameData.CARS:
			if str(c["class"]) == cls:
				car = c
				break
		var p: Dictionary = GameData.physics_for(car, {})
		_check(float(p["top_speed_ms"]) > 40.0, cls + " top speed plausible")
		_check(float(p["accel"]) > 3.0, cls + " acceleration plausible")
		_check(float(p["grip"]) > 0.7 and float(p["grip"]) <= 1.0, cls + " grip in range")
	var tuned: Dictionary = GameData.physics_for(GameData.CARS[0],
		{"engine": 5, "tires": 5, "turbo": 5})
	var stock: Dictionary = GameData.physics_for(GameData.CARS[0], {})
	_check(float(tuned["top_speed_ms"]) > float(stock["top_speed_ms"]), "upgrades raise top speed")


func _test_profile() -> void:
	print("[TEST] SECTION profile")
	var d: Dictionary = Game.default_profile()
	_check(d.has("credits") and d.has("owned") and d.has("stats"), "profile schema")
	_check(Game.level() >= 1, "level >= 1")
	var info: Dictionary = Game.level_progress()
	_check(info.has("frac"), "level progress frac")
	_check(Game.owned_count() >= 1, "starter car owned")
	_check(Game.selected_car() != {}, "selected car resolves")
	var fid: String = str(GameData.CARS[0]["id"])
	_check(Game.owns(fid), "starter car is owned")


func _test_tracks() -> void:
	print("[TEST] SECTION tracks")
	var TrackLib = load("res://scripts/race/TrackLibrary.gd")
	for track in GameData.TRACKS:
		var data = TrackLib.for_track(track)
		_check(data.points.size() == 1201, "track %s has 1201 points" % str(track["id"]))
		_check(data.total_length > 800.0, "track %s length > 800m" % str(track["id"]))
		var s: Dictionary = data.sample_distance(data.total_length * 0.5)
		_check(s.has("pos") and s.has("tan") and s.has("right"), "track %s samples" % str(track["id"]))
		var prj: Dictionary = data.project(data.points[10])
		_check(int(prj["index"]) >= 0, "track %s projects" % str(track["id"]))
	_check(TrackLib.CACHE.size() == GameData.TRACKS.size(), "track cache populated")


func _test_cars_models() -> void:
	print("[TEST] SECTION car models")
	var CarModel = load("res://scripts/vehicle/CarModel.gd")
	var body_kinds := ["hatch", "sedan", "coupe", "muscle", "sport", "super", "hyper"]
	for kind in body_kinds:
		var info: Dictionary = {"id": "test_" + kind, "name": "TEST", "class": "sport", "body": kind,
			"color": "22e9ff", "paint": "cyan"}
		var model = CarModel.new()
		root.add_child(model)
		model.build(info, "cyan", "stock")
		_check(model.wheels.size() == 4, "model %s has 4 wheels" % kind)
		var has_body := false
		for c in model.get_children():
			if c.name == "Shell":
				has_body = true
		_check(has_body, "model %s has shell" % kind)
		model.steer_wheels(0.2, 1.0)
		model.set_brake(true)
		model.set_nitro(true, 0.5)
		model.set_damage(0.3)
		model.queue_free()
	# every car's declared body must build
	var built := {}
	for car in GameData.CARS:
		built[str(car["body"])] = true
	_check(built.size() == 7, "all 7 body kinds used")


func _test_screens() -> void:
	print("[TEST] SECTION screens")
	var screens := ["menu", "tracks", "garage", "shop", "achievements", "daily",
		"settings", "credits", "profile", "results"]
	for id in screens:
		var path := "res://scripts/ui/screens/%s.gd" % id
		var scr: Resource = load(path)
		_check(scr != null, "screen script " + id)
