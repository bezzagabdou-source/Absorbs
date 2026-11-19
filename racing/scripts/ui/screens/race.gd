extends Control
## Race screen: 3D world (track + environment + cars), HUD, AI opponents,
## lap/checkpoint logic, pause menu, results hand-off. Supports circuit, time
## trial and drag modes.

const TrackBuilderScript = preload("res://scripts/race/TrackBuilder.gd")
const EnvironmentRigScript = preload("res://scripts/race/EnvironmentRig.gd")
const CarControllerScript = preload("res://scripts/vehicle/CarController.gd")
const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")
const ChaseCameraScript = preload("res://scripts/race/ChaseCamera.gd")
const AIDriverScript = preload("res://scripts/race/AIDriver.gd")
const HUD = preload("res://scripts/ui/RaceHUD.gd")

var router
var params: Dictionary = {}

var mode = "circuit"
var track: Dictionary = {}
var laps_target = 3

var world: Node3D
var viewport: SubViewport
var viewport_container: SubViewportContainer
var builder
var env_rig
var player
var ai_cars: Array = []
var cam
var hud

var race_time = 0.0
var state = "countdown"     # countdown | racing | finished
var lap = 1
var checkpoint_idx = 0
var laps: Array = []
var lap_mark = 0.0
var position = 1
var player_progress = 0.0
var best_lap_seen = 0.0
var _last_speed = 0.0
var _shake_cd = 0.0
var _wrong_way_t = 0.0
var _finish_delay = 0.0
var _started_engine = false
var _touch_steer_smooth = 0.0


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	track = params.get("track", GameData.TRACKS[0])
	mode = str(params.get("mode", "circuit"))
	laps_target = int(params.get("laps", track.get("laps", 3)))
	_build_world()
	_build_hud()
	_start_race()


func _build_world() -> void:
	viewport = SubViewport.new()
	viewport.size = Vector2i(1920, 1080)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_2X
	viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA
	viewport.use_taa = false
	viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR
	viewport.scaling_3d_scale = clampf(float(SettingsStore.get_value("render_scale", 1.0)), 0.6, 1.0)
	viewport_container = SubViewportContainer.new()
	viewport_container.set_anchors_preset(Control.PRESET_FULL_RECT)
	viewport_container.stretch = true
	viewport_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport_container.add_child(viewport)
	add_child(viewport_container)
	world = Node3D.new()
	world.name = "World"
	viewport.add_child(world)
	builder = TrackBuilderScript.new()
	builder.name = "Track"
	world.add_child(builder)
	builder.build(track)
	env_rig = EnvironmentRigScript.new()
	env_rig.name = "Environment"
	world.add_child(env_rig)
	env_rig.setup(str(track["env"]), str(track["time"]), str(track["weather"]), builder.accent)
	cam = ChaseCameraScript.new()
	world.add_child(cam)
	_spawn_player()
	_spawn_ai()


func _spawn_player() -> void:
	var car: Dictionary = Game.selected_car()
	if car.is_empty():
		car = GameData.CARS[0]
	var physics: Dictionary = Game.physics_for(str(car["id"]))
	player = CarControllerScript.new()
	player.name = "PlayerCar"
	player.collision_layer = 2
	player.collision_mask = 1
	world.add_child(player)
	player.apply_physics(physics, true)
	var model = CarModelScript.new()
	var rec: Dictionary = Game.car_record(str(car["id"]))
	var paint_id = str(rec.get("paint", car.get("paint", "cyan")))
	model.build(car, paint_id, str(rec.get("rim", "stock")))
	player.attach_model(model)
	var st: Transform3D = builder.start_transform
	player.global_transform = Transform3D(st.basis, st.origin + st.basis.x * 4.2 + st.basis.z * 6.0)
	player.impact.connect(_on_player_impact)
	player.nitro_started.connect(func(): cam.set_nitro(true); AudioDirector.play_sfx("nitro", -4.0))
	player.nitro_ended.connect(func(): cam.set_nitro(false))
	player.gear_changed.connect(func(_g): AudioDirector.play_sfx("gear_shift", -16.0))
	cam.bind(player)


func _spawn_ai() -> void:
	var count = 5
	if mode == "drag":
		count = 1
	elif mode == "time_trial":
		count = 0
	var used: Array = []
	for i in range(count):
		var pool: Array = GameData.CARS.filter(func(c): return str(c["class"]) == str(_ai_class()))
		var car: Dictionary = pool[i % pool.size()] if pool.size() > 0 else GameData.CARS[i + 8]
		var ctrl = CarControllerScript.new()
		ctrl.name = "AICar%d" % i
		ctrl.collision_layer = 4
		ctrl.collision_mask = 1
		world.add_child(ctrl)
		var base_stats: Dictionary = car["stats"]
		var skill = 0.72 + 0.05 * i
		var stats: Dictionary = base_stats.duplicate()
		for k in stats.keys():
			stats[k] = clampf(float(stats[k]) + (skill - 0.72) * 18.0, 5.0, 100.0)
		var physics: Dictionary = GameData.physics_for({"stats": stats}, {})
		ctrl.apply_physics(physics, false)
		var model = CarModelScript.new()
		model.build(car, "", "stock")
		ctrl.attach_model(model)
		var st: Transform3D = builder.start_transform
		var lane = -4.2 if i % 2 == 0 else 4.2
		var back = 6.0 + float(int(i / 2) + 1) * 7.0
		ctrl.global_transform = Transform3D(st.basis, st.origin + st.basis.x * lane + st.basis.z * back)
		used.append(car)
		var driver = AIDriverScript.new()
		driver.setup(ctrl, builder.data, skill + _difficulty_bonus(), lane * 0.4)
		ai_cars.append({"node": ctrl, "driver": driver, "name": str(car["name"]),
			"color": GameData.CLASS_INFO[str(car["class"])]["color"]})


func _ai_class() -> String:
	var car: Dictionary = Game.selected_car()
	var pc = str(car.get("class", "street"))
	return pc


func _difficulty_bonus() -> float:
	var diff = int(track.get("difficulty", 1))
	return clampf((diff - 1) * 0.03, 0.0, 0.12)


func _build_hud() -> void:
	hud = HUD.new()
	hud.player = player
	hud.track_data = builder.data
	hud.accent = builder.accent
	add_child(hud)
	hud.pause_pressed.connect(_toggle_pause)


func _start_race() -> void:
	state = "countdown"
	AudioDirector.play_music("race_theme", 0.6, -9.0)
	player.input_enabled = false
	for ai in ai_cars:
		ai["node"].input_enabled = false
	await get_tree().create_timer(0.45).timeout
	await hud.start_countdown()
	state = "racing"
	race_time = 0.0
	lap_mark = 0.0
	player.input_enabled = true
	for ai in ai_cars:
		ai["node"].input_enabled = true


func _process(delta: float) -> void:
	if state == "racing":
		race_time += delta
		if player and player.input_enabled:
			_read_driver_input(delta)
	if state != "finished" and state != "paused":
		for ai in ai_cars:
			var ctrl = ai["node"]
			if not ctrl.input_enabled:
				continue
			var prj: Dictionary = builder.data.project(ctrl.global_position)
			ai["driver"].tick(delta, player_progress, float(prj["along"]))
	if player:
		cam.physics_tick(delta)
		_update_lap(delta)
		_update_standings()
		_update_audio()
		_update_hud(delta)
	if env_rig and player:
		env_rig.set_rain_follow(player.global_position)


func _read_driver_input(delta: float) -> void:
	var steer = Input.get_axis("steer_left", "steer_right")
	var throttle = Input.get_action_strength("throttle")
	var brake = Input.get_action_strength("brake")
	var nitro = Input.is_action_pressed("nitro")
	var handbrake = Input.is_action_pressed("handbrake")
	if Input.is_action_just_pressed("camera"):
		cam.cycle_mode()
	var mode_sel = str(SettingsStore.get_value("steer_mode", "buttons"))
	if mode_sel == "wheel":
		steer = player.steer
	elif mode_sel == "tilt":
		var tilt = Input.get_gravity().x if Input.get_gravity().length() > 0.1 else 0.0
		var t = clampf(tilt / 9.8, -1.0, 1.0)
		if bool(SettingsStore.get_value("invert_tilt", false)):
			t = -t
		steer = clampf(t * 1.8 * float(SettingsStore.get_value("sensitivity", 1.0)), -1.0, 1.0)
	if hud.touch_steer() != 0.0:
		_touch_steer_smooth = lerpf(_touch_steer_smooth, hud.touch_steer(), delta * 9.0)
		steer = _touch_steer_smooth
	brake = maxf(brake, hud.touch_brake())
	nitro = nitro or hud.touch_nitro()
	player.set_inputs(throttle, brake, steer, nitro, handbrake)


func _update_lap(_delta: float) -> void:
	var prj: Dictionary = builder.data.project(player.global_position, checkpoint_idx * 150)
	player_progress = float(prj["along"])
	var cps: Array = builder.checkpoints
	if cps.is_empty():
		return
	var next_cp: Dictionary = cps[checkpoint_idx % cps.size()]
	var dist = global_along_distance(player_progress, float(next_cp["along"]))
	if dist < 45.0:
		checkpoint_idx += 1
		AudioDirector.play_sfx("ui_confirm", -12.0)
		if checkpoint_idx % cps.size() == 0:
			_complete_lap()
			checkpoint_idx = 0
	var tan: Vector3 = prj["tan"] if prj.has("tan") else builder.data.tangents[int(prj["index"])]
	var fwd = -player.global_transform.basis.z
	if tan.dot(fwd) < -0.35 and player.speed_kmh() > 12.0:
		_wrong_way_t += _delta
	else:
		_wrong_way_t = 0.0


func global_along_distance(a: float, b: float) -> float:
	var total: float = builder.data.total_length
	var d = absf(a - b)
	return minf(d, total - d)


func _complete_lap() -> void:
	var lap_time = race_time - lap_mark
	if lap_time < 3.0:
		return
	laps.append(lap_time)
	lap_mark = race_time
	if best_lap_seen <= 0.0 or lap_time < best_lap_seen:
		best_lap_seen = lap_time
	if lap < laps_target:
		lap += 1
		AudioDirector.play_sfx("ui_confirm", -6.0)
	else:
		_finish_race()


func _finish_race() -> void:
	if state == "finished":
		return
	state = "finished"
	player.input_enabled = false
	for ai in ai_cars:
		ai["node"].input_enabled = false
	AudioDirector.stop_race_audio(1.2)
	var total = race_time
	var reward: int = int(track.get("reward", 3000))
	var pos_bonus = [1.0, 0.72, 0.55, 0.4, 0.3, 0.22]
	var mult: float = pos_bonus[clampi(position - 1, 0, 5)] if mode == "circuit" else 1.0
	var clean = player.wall_hits == 0
	var result: Dictionary = {
		"track": str(track["id"]),
		"track_name": str(track["name"]),
		"mode": mode,
		"position": position if mode == "circuit" else 1,
		"total": position,
		"time": total,
		"best_lap": best_lap_seen,
		"laps": laps.duplicate(),
		"distance_km": player.distance_travelled / 1000.0,
		"top_speed": _last_speed,
		"drift_time": player.drift_time,
		"nitro_time": player.nitro_used_time,
		"clean_lap": clean,
		"wall_hits": player.wall_hits,
		"time_of_day": str(track["time"]),
		"weather": str(track["weather"]),
		"credits": int(reward * mult),
		"xp": int(reward * 0.12 * mult),
	}
	await get_tree().create_timer(1.4).timeout
	router.goto("results", result, false)


func _update_standings() -> void:
	var ahead = 0
	for ai in ai_cars:
		var prj: Dictionary = builder.data.project(ai["node"].global_position)
		var ai_prog = float(prj["along"]) + float(ai["node"].laps_completed) * builder.data.total_length
		var mine = player_progress + float(lap - 1) * builder.data.total_length
		if ai_prog > mine:
			ahead += 1
	position = ahead + 1


func _update_audio() -> void:
	AudioDirector.set_engine(player.rpm_ratio(), player.throttle, true)
	AudioDirector.set_screech(player.drift_amount * clampf(player.speed_kmh() / 160.0, 0.0, 1.0))
	AudioDirector.set_wind(clampf((player.speed_kmh() - 80.0) / 300.0, 0.0, 1.0))
	_last_speed = maxf(_last_speed, player.speed_kmh())


func _update_hud(delta: float) -> void:
	var t = race_time
	var stats: Dictionary = {
		"speed": player.speed_kmh(),
		"gear": player.gear,
		"nitro": player.nitro_amount,
		"nitro_active": player.nitro_active,
		"damage": player.damage,
		"drift": player.drift_amount,
		"position_text": "%d/%d" % [position, ai_cars.size() + 1] if mode == "circuit" else "TT",
		"lap_text": "%d/%d" % [lap, laps_target] if mode == "circuit" else "1/1",
		"time_text": format_time(t),
		"best_text": format_time(best_lap_seen) if best_lap_seen > 0.0 else "--:--.--",
		"wrong_way": _wrong_way_t > 0.9,
	}
	hud.tick(delta, stats)


func format_time(t: float) -> String:
	if t <= 0.0:
		return "00:00.00"
	var m = int(t / 60.0)
	var s = int(t) % 60
	var cs = int((t - floorf(t)) * 100.0)
	return "%02d:%02d.%02d" % [m, s, cs]


func _on_player_impact(strength: float) -> void:
	cam.add_shake(clampf(strength / 18.0, 0.2, 2.0))
	AudioDirector.play_sfx("crash", -3.0)
	if strength > 8.0:
		hud.flash_warning(Localization.t("hud.crash"), UIStyle.AMBER)


func _toggle_pause() -> void:
	if state == "finished":
		return
	if state == "racing":
		state = "paused"
		get_tree().paused = true
		_build_pause_menu()
	elif state == "paused":
		_resume()


func _build_pause_menu() -> void:
	var overlay = ColorRect.new()
	overlay.name = "PauseOverlay"
	overlay.color = Color(0.01, 0.02, 0.04, 0.72)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(overlay)
	var panel = UIStyle.make_glass_panel(34, Color(0.05, 0.08, 0.14, 0.92), 48, 0.35)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(560, 0)
	panel.offset_left = -280
	panel.offset_right = 280
	overlay.add_child(panel)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 18)
	panel.add_child(v)
	v.add_child(UIStyle.make_title(Localization.t("race.paused"), 64, builder.accent, HORIZONTAL_ALIGNMENT_CENTER))
	var resume = UIStyle.make_button(Localization.t("race.resume"), builder.accent, true, 30, 84)
	resume.pressed.connect(_resume)
	v.add_child(resume)
	var restart = UIStyle.make_button(Localization.t("race.restart"), UIStyle.VIOLET, false, 30, 84)
	restart.pressed.connect(func(): _restart())
	v.add_child(restart)
	var quit = UIStyle.make_button(Localization.t("race.quit"), UIStyle.RED, false, 30, 84)
	quit.pressed.connect(func(): _quit_to_menu())
	v.add_child(quit)


func _resume() -> void:
	get_tree().paused = false
	state = "racing"
	var overlay = get_node_or_null("PauseOverlay")
	if overlay:
		overlay.queue_free()


func _restart() -> void:
	get_tree().paused = false
	router.goto("race", params, false)


func _quit_to_menu() -> void:
	get_tree().paused = false
	AudioDirector.stop_race_audio(0.6)
	router.goto("menu", {}, false)


func _exit_tree() -> void:
	get_tree().paused = false
	AudioDirector.stop_race_audio(0.4)
