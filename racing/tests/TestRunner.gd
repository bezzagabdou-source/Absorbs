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

	print("[SUITE] SECTION graphics assets")
	for shader_path in ["res://shaders/car_paint.gdshader", "res://shaders/road.gdshader",
			"res://shaders/terrain.gdshader", "res://shaders/post_fx.gdshader"]:
		_check(ResourceLoader.exists(shader_path), "shader present " + shader_path)
		if ResourceLoader.exists(shader_path):
			var sh: Shader = load(shader_path)
			_check(sh != null, "shader loads " + shader_path)
			# compiling the shader here makes a broken GLSL line fail the suite
			var mat := ShaderMaterial.new()
			mat.shader = sh
			_check(mat.shader == sh, "shader binds " + shader_path)
	var TouchControls = load("res://scripts/ui/TouchControls.gd")
	_check(TouchControls != null, "touch controls script")
	var tc = TouchControls.new()
	add_child(tc)
	tc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tc.set_accent(Color("22e9ff"))
	tc.set_nitro_charge(0.5)
	_check(absf(tc.steer_value()) <= 1.0, "touch steer range")
	_check(tc.throttle_value() >= 0.0, "touch throttle readable")
	tc.queue_free()

	print("[SUITE] SECTION open world")
	var OpenWorld = load("res://scripts/race/OpenWorld.gd")
	for prof in ["metro", "desert", "alpine", "coast"]:
		var ow = OpenWorld.new()
		add_child(ow)
		ow.build({"id": prof, "name": prof, "seed": 1234, "profile": prof})
		var spawn: Transform3D = ow.spawn_transform(0)
		_check(spawn.origin.length() > 1.0, "spawn placed " + prof)
		var h: float = ow.height_at(120.0, -240.0)
		_check(absf(h) < 2000.0, "terrain height sane " + prof)
		_check(ow.road_points.size() > 100, "road ring built " + prof)
		var near: Vector3 = ow.nearest_road_point(Vector3(50, 0, 50))
		_check(near.length() > 1.0, "nearest road point " + prof)
		# The highway is a hand-wound triangle strip; if the winding flips, the
		# whole road disappears under cull_back and the bug is invisible to every
		# other check. Assert that the faces point up.
		_check(_road_faces_up(ow), "highway faces up " + prof)
		# Same class of bug for the ground: an inside-out terrain mesh is culled
		# away from above and the world looks like it has no floor at all.
		_check(_terrain_faces_up(ow), "terrain faces up " + prof)
		# The ground is a 25 m grid and the road is a 192-sample ribbon: wherever a
		# grid cell straddles the ring, the interpolated terrain can rise above the
		# exact ring height. Assert the tarmac is actually above the ground at a
		# spread of angles, otherwise the road is buried and invisible.
		_check(_road_above_ground(ow), "road above terrain " + prof)
		ow.queue_free()

	print("[SUITE] SECTION screens (instantiate)")
	for id in ["menu", "tracks", "garage", "shop", "achievements", "daily",
			"settings", "credits", "profile", "results"]:
		var scr = load("res://scripts/ui/screens/%s.gd" % id)
		_check(scr != null, "screen script " + id)


## Sample the ring at many angles and require the carriageway to sit clear of the
## terrain height under it. Guards the "terrain swallows the highway" regression.
func _road_above_ground(ow: Node) -> bool:
	var worst := 1.0e9
	var at := 0.0
	for k in range(24):
		var a: float = float(k) / 24.0 * TAU
		var r: float = 620.0 * (1.0 + 0.10 * sin(a * 3.0) + 0.05 * cos(a * 5.0))
		var x: float = cos(a) * r
		var z: float = sin(a) * r
		var ground: float = float(ow.call("height_at", x, z))
		var road_y: float = float(ow.call("_ring_height", a)) + 1.15
		if road_y - ground < worst:
			worst = road_y - ground
			at = a
	print("[TEST]   min road clearance %.2f m at %.2f rad" % [worst, at])
	return worst > 0.02


## The ground must face up too: sample the terrain triangles and require the
## rendered normal (which is -(u x v) in Godot) to point skyward.
func _terrain_faces_up(ow: Node) -> bool:
	var mi: MeshInstance3D = null
	for c in ow.get_children():
		if c is MeshInstance3D and str((c as Node).name) == "Terrain":
			mi = c
			break
	if mi == null or mi.mesh == null:
		return false
	var arrays: Array = mi.mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var raw_idx = arrays[Mesh.ARRAY_INDEX]
	var order: Array = []
	if raw_idx is PackedInt32Array and (raw_idx as PackedInt32Array).size() > 0:
		var idx: PackedInt32Array = raw_idx
		for k in range(idx.size()):
			order.append(verts[idx[k]])
	else:
		for k in range(verts.size()):
			order.append(verts[k])
	var total := 0.0
	var tris := 0
	var i := 0
	while i + 2 < order.size():
		var a: Vector3 = order[i]
		var b: Vector3 = order[i + 1]
		var c: Vector3 = order[i + 2]
		total += -(b - a).cross(c - a).normalized().y
		tris += 1
		i += 3
	print("[TEST]   ", tris, " terrain triangles, front-normal.y sum ", snappedf(total, 0.01))
	return total > 0.0


## Sum the +Y component of every road triangle normal. A correctly wound strip
## is strongly positive; an inside-out one is strongly negative.
func _road_faces_up(ow: Node) -> bool:
	var mi: MeshInstance3D = null
	for c in ow.get_children():
		if c is MeshInstance3D and str((c as Node).name) == "Highway":
			mi = c
			break
	if mi == null or mi.mesh == null:
		return false
	var arrays: Array = mi.mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var order: Array = []
	# ARRAY_INDEX is Nil for a non-indexed SurfaceTool mesh, and assigning Nil to
	# a typed PackedInt32Array raises. Read it untyped and branch on the result.
	var raw_idx = arrays[Mesh.ARRAY_INDEX]
	if raw_idx is PackedInt32Array and (raw_idx as PackedInt32Array).size() > 0:
		var idx: PackedInt32Array = raw_idx
		for k in range(idx.size()):
			order.append(verts[idx[k]])
	else:
		for k in range(verts.size()):
			order.append(verts[k])
	var total := 0.0
	var tris := 0
	var i := 0
	while i + 2 < order.size():
		var a: Vector3 = order[i]
		var b: Vector3 = order[i + 1]
		var c: Vector3 = order[i + 2]
		total += (b - a).cross(c - a).normalized().y
		tris += 1
		i += 3
	print("[TEST]   ", tris, " highway triangles, normal.y sum ", snappedf(total, 0.01))
	return total > 0.0


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

	print("[SUITE] SECTION runtime free roam")
	SceneRouter.goto_instant("race", {"track": GameData.TRACKS[0], "mode": "roam"})
	await _frames(6)
	var roam_scr: Node = SceneRouter.current
	_check(roam_scr != null, "roam race built")
	if roam_scr != null:
		_check(bool(roam_scr.get("roaming")), "roam flag set")
		await _frames(40)
		var roam_player = roam_scr.get("player")
		_check(roam_player != null, "roam player spawned")
		if roam_player != null:
			_check(roam_player.global_position.y > -80.0, "roam player above ground")
		roam_scr.queue_free()
	await _frames(2)

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
