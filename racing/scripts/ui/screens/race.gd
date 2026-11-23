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
const OpenWorldScript = preload("res://scripts/race/OpenWorld.gd")
const HUD = preload("res://scripts/ui/RaceHUD.gd")
const MAP_SCRIPT = preload("res://scripts/ui/WorldMap.gd")
const SkidEffectsScript = preload("res://scripts/race/SkidEffects.gd")
const TrafficSystemScript = preload("res://scripts/race/TrafficSystem.gd")
const WorldSystemsScript = preload("res://scripts/race/WorldSystems.gd")

var router
var params: Dictionary = {}

var mode = "circuit"
var track: Dictionary = {}
var laps_target = 3

var world: Node3D
var viewport: SubViewport
var viewport_container: SubViewportContainer
var builder
var open_world
var roaming := false
var env_rig
var player
var ai_cars: Array = []
var cam
var hud
var world_map
var post: ColorRect
var post_mat: ShaderMaterial
var _damage_flash := 0.0

var race_time = 0.0
var state = "countdown"     # countdown | racing | finished
var lap = 1
var checkpoint_idx = 0
var laps: Array = []
var lap_mark = 0.0
var car_position = 1
var player_progress = 0.0
var best_lap_seen = 0.0
var _last_speed = 0.0
var _shake_cd = 0.0
var _wrong_way_t = 0.0
var _finish_delay = 0.0
var _started_engine = false
var _touch_steer_smooth = 0.0
var skid                              ## SkidEffects
var living                            ## TrafficSystem (traffic + people + police)
var systems                           ## WorldSystems (fuel, day cycle, weather)
var _camera_mode: int = 0
var _shift_flash: float = 0.0
var _engine_off: bool = false
var _horn_cd: float = 0.0
var gameplay_tuning: Dictionary = {}
var _last_wall_hits: int = 0
var _mode_timer: float = 0.0
var _mode_target: float = 0.0
var _pursuit_survived: float = 0.0
var _busted: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	track = params.get("track", GameData.TRACKS[0])
	mode = str(params.get("mode", "circuit"))
	laps_target = int(params.get("laps", track.get("laps", 3)))
	_build_world()
	_build_post()
	_build_hud()
	_start_race()


## Free-roam regions. Each map gets a deterministic seed so the terrain, the
## highway loop and the landmarks are identical every time you visit.
const ROAM_REGIONS := {
	"neon_harbor": {"id": "neon_harbor", "name": "NEON HARBOR", "seed": 2026,
		"profile": "metro", "accent": Color(0.13, 0.91, 1.0)},
	"dune_fury": {"id": "dune_fury", "name": "DUNE FURY", "seed": 4411,
		"profile": "desert", "accent": Color(1.0, 0.62, 0.22)},
	"alpine_run": {"id": "alpine_run", "name": "ALPINE RUN", "seed": 9081,
		"profile": "alpine", "accent": Color(0.55, 0.85, 1.0)},
	"coast_highway": {"id": "coast_highway", "name": "COAST HIGHWAY", "seed": 3377,
		"profile": "coast", "accent": Color(1.0, 0.55, 0.30)},
}


func _roam_region_for() -> Dictionary:
	var key := str(track.get("id", "neon_harbor"))
	if ROAM_REGIONS.has(key):
		return ROAM_REGIONS[key]
	# map any circuit onto a region that matches its biome
	match str(track.get("env", "city")):
		"desert", "canyon":
			return ROAM_REGIONS["dune_fury"]
		"mountain":
			return ROAM_REGIONS["alpine_run"]
		"coast":
			return ROAM_REGIONS["coast_highway"]
		_:
			return ROAM_REGIONS["neon_harbor"]


func _build_open_world() -> void:
	var region := _roam_region_for()
	open_world = OpenWorldScript.new()
	open_world.name = "OpenWorld"
	world.add_child(open_world)
	open_world.build(region)


## Cinematic post stack. A full-rect ColorRect samples the 3D viewport texture
## through post_fx.gdshader, so the grade, vignette, aberration, grain and
## flare all stay inside the mobile fill budget (one full-screen pass).
func _build_post() -> void:
	var shader_path := "res://shaders/post_fx.gdshader"
	if not ResourceLoader.exists(shader_path):
		return
	post_mat = ShaderMaterial.new()
	post_mat.shader = load(shader_path)
	post = ColorRect.new()
	post.name = "PostFX"
	post.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	post.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post.color = Color(1, 1, 1, 1)
	post.material = post_mat
	add_child(post)
	# the post pass reads the 3D viewport texture directly and must draw last
	if viewport != null:
		post_mat.set_shader_parameter("scene_tex", viewport.get_texture())
		move_child(post, get_child_count() - 1)
	update_post()


## Push the current lighting/weather into the post shader.
func update_post() -> void:
	if post_mat == null:
		return
	var key := str(track.get("env", "city")) + "_" + str(track.get("time", "night"))
	var night := 1.0 if str(track.get("time", "night")) == "night" else 0.0
	post_mat.set_shader_parameter("night_mode", night)
	post_mat.set_shader_parameter("exposure", 1.06 if night > 0.5 else 1.0)
	post_mat.set_shader_parameter("contrast", 1.10)
	post_mat.set_shader_parameter("saturation", 1.14 if night > 0.5 else 1.06)
	post_mat.set_shader_parameter("vignette", 0.46 if night > 0.5 else 0.30)
	post_mat.set_shader_parameter("aberration", 0.22)
	post_mat.set_shader_parameter("grain", 0.022)
	post_mat.set_shader_parameter("bloom_bleed", 0.10)
	var sun_dir: Vector3 = Vector3(0.4, 0.3, -0.8)
	if env_rig and env_rig.sun:
		sun_dir = -env_rig.sun.global_transform.basis.z
	var fpos := Vector2(0.5, 0.5)
	var c: Camera3D = cam.camera() if cam else null
	if c and size.x > 1.0 and size.y > 1.0:
		var sp: Vector2 = c.unproject_position(c.global_position + sun_dir * 500.0)
		fpos = Vector2(sp.x / size.x, sp.y / size.y)
	post_mat.set_shader_parameter("flare_pos", fpos)
	var flare := 0.0
	if str(track.get("time", "night")) == "sunset" or str(track.get("time", "day")) == "day":
		flare = 0.55
	post_mat.set_shader_parameter("flare_strength", flare)
	var warm := str(track.get("time", "night")) == "sunset"
	post_mat.set_shader_parameter("flare_color", Color(1.0, 0.62, 0.34) if warm else Color(1.0, 0.95, 0.86))


func _build_world() -> void:
	viewport = SubViewport.new()
	viewport.size = Vector2i(1280, 720)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_2X
	viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA
	viewport.use_taa = false
	# FSR1 is a Forward+/Mobile feature; asking for it on the compatibility
	# backend logs an error every frame the viewport updates.
	if RenderingServer.get_rendering_device() != null:
		viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR
	viewport.scaling_3d_scale = clampf(float(SettingsStore.get_value("render_scale", 1.0)), 0.6, 1.0)
	viewport_container = SubViewportContainer.new()
	viewport_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewport_container.stretch = true
	viewport_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport_container.add_child(viewport)
	add_child(viewport_container)
	world = Node3D.new()
	world.name = "World"
	viewport.add_child(world)
	# Drift and Pursuit are open-world modes: they need a region, not a circuit.
	roaming = str(mode) in ["roam", "drift", "pursuit"]
	if roaming:
		_build_open_world()
	else:
		builder = TrackBuilderScript.new()
		builder.name = "Track"
		world.add_child(builder)
		builder.build(track)
	env_rig = EnvironmentRigScript.new()
	env_rig.name = "Environment"
	world.add_child(env_rig)
	if roaming:
		env_rig.setup(str(track["env"]), str(track["time"]), str(track["weather"]),
			open_world.region.get("accent", Color(0.13, 0.91, 1.0)))
	else:
		env_rig.setup(str(track["env"]), str(track["time"]), str(track["weather"]), builder.accent)
	cam = ChaseCameraScript.new()
	# Free roam opens on a cinematic establishing orbit so the map reads before
	# the player takes over; the camera drops to chase the moment they touch the
	# throttle (see _read_driver_input).
	cam.showcase = roaming
	world.add_child(cam)
	_spawn_player()
	_spawn_ai()
	_build_systems()


## Everything that makes the world feel inhabited and alive: tyre marks, smoke,
## moving traffic, pedestrians, police, fuel, weather and the clock.
##
## Each piece is optional at runtime — the quality governor can switch traffic
## and pedestrians off entirely on a weak device without touching the physics.
func _build_systems() -> void:
	# --- surface effects on the player's car ---
	skid = SkidEffectsScript.new()
	skid.name = "SkidEffects"
	world.add_child(skid)
	skid.bind(player, player.model())

	# --- traffic, pedestrians and police ---
	var quality := str(SettingsStore.get_value("quality", "high"))
	if quality != "low":
		living = TrafficSystemScript.new()
		living.name = "LivingWorld"
		world.add_child(living)
		var region: Dictionary = _roam_region_for()
		living.build(open_world if roaming else builder, region)
		living.set_player(player)
		living.enabled_pedestrians = quality != "medium"
		living.enabled_traffic = true

	# --- fuel, weather, day cycle ---
	systems = WorldSystemsScript.new()
	systems.name = "WorldSystems"
	add_child(systems)
	systems.setup(player, env_rig, str(_roam_region_for().get("profile", "metro")))
	systems.cycle_enabled = roaming
	if roaming and open_world != null:
		systems.place_stations(float(open_world.ROAD_RING_RADIUS), 8)
	elif builder != null:
		systems.place_stations(float(builder.data.total_length) / TAU, 6)
	systems.fuel_low.connect(_on_fuel_low)
	systems.broke_down.connect(_on_broke_down)
	systems.refuelled.connect(_on_refuelled)
	if living != null:
		living.heat_changed.connect(_on_heat_changed)
		living.police_spotted.connect(_on_police_spotted)


func _on_fuel_low() -> void:
	if hud:
		hud.flash_warning("FUEL LOW", Color(1.0, 0.72, 0.20))


func _on_broke_down() -> void:
	AudioDirector.play_sfx("ui_error", -8.0)
	if hud:
		hud.flash_warning("OUT OF FUEL", Color(1.0, 0.32, 0.24))


func _on_refuelled() -> void:
	AudioDirector.play_sfx("ui_confirm", -8.0)
	if hud:
		hud.flash_warning("REFUELLED + REPAIRED", Color(0.45, 1.0, 0.62))


func _on_heat_changed(level: int) -> void:
	if level > 0:
		AudioDirector.play_sfx("ui_alert", -6.0)
		if hud:
			hud.flash_warning("POLICE PURSUIT %d" % level, Color(0.45, 0.62, 1.0))


func _on_police_spotted() -> void:
	if hud:
		hud.flash_warning("SPOTTED", Color(1.0, 0.35, 0.35))


func _spawn_player() -> void:
	var car: Dictionary = Game.selected_car()
	if car.is_empty():
		car = GameData.CARS[0]
	var physics: Dictionary = Game.physics_for(str(car["id"]))
	gameplay_tuning = physics.duplicate(true)
	# how far each upgrade has come, so the engine note and the turbo spool
	# reflect what the player actually bought
	gameplay_tuning["turbo_level"] = Game.upgrade_level(str(car["id"]), "turbo")
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
	if roaming:
		player.global_transform = open_world.spawn_transform(0)
		if (OS.get_cmdline_args() + OS.get_cmdline_user_args()).has("--qa-probe"):
			var t := Timer.new()
			t.wait_time = 0.6
			t.one_shot = true
			t.autostart = true
			t.timeout.connect(_qa_probe)
			add_child(t)
	else:
		var st: Transform3D = builder.start_transform
		player.global_transform = Transform3D(st.basis, st.origin + st.basis.x * 4.2 + st.basis.z * 6.0)
	player.impact.connect(_on_player_impact)
	player.nitro_started.connect(func(): cam.set_nitro(true); AudioDirector.play_sfx("nitro", -4.0))
	player.nitro_ended.connect(func(): cam.set_nitro(false))
	player.gear_changed.connect(func(_g): AudioDirector.play_sfx("gear_shift", -16.0))
	if roaming and open_world != null:
		# hand the camera the direction of the tarmac it is standing on, so an
		# establishing shot can look down the road instead of across it
		var q: Vector3 = open_world.nearest_road_point(player.global_position)
		var ahead: Vector3 = open_world.road_direction_at(player.global_position)
		cam.road_ahead = ahead
		cam.road_point = q
	cam.bind(player)
	player.input_enabled = true


var _qa_lines: PackedStringArray = PackedStringArray()


func _qa_log(t: String) -> void:
	print(t)
	_qa_lines.append(t)


func _qa_flush() -> void:
	# user:// only. Writing to res:// at runtime makes the resource filesystem
	# rescan mid-frame, which stalled the renderer and produced black captures.
	var f := FileAccess.open("user://qa_probe.log", FileAccess.WRITE)
	if f:
		f.store_string("\n".join(_qa_lines) + "\n" + "\n".join(open_world.qa_log_lines))
		f.close()


## QA-only: print where the car actually is relative to the highway, in metres.
func _qa_probe() -> void:
	# CI job logs are behind an authenticated blob URL that the agent cannot read,
	# so the probe writes a file INSIDE the repo and the workflow commits it.
	_qa_lines.append("=== probe %s" % Time.get_datetime_string_from_system())
	var cp: Vector3 = player.global_position
	var near: Vector3 = open_world.nearest_road_point(cp)
	var flat: float = Vector2(cp.x - near.x, cp.z - near.z).length()
	_qa_log("[QAPROBE] car=%s nearest_road=%s lateral=%.2fm dy=%.2fm" % [cp, near, flat, cp.y - near.y])
	var c: Camera3D = cam.camera()
	_qa_log("[QAPROBE] cam=%s showcase=%s dist_to_car=%.1fm" % [c.global_position, cam.showcase,
		c.global_position.distance_to(cp)])
	if (OS.get_cmdline_args() + OS.get_cmdline_user_args()).has("--qa-chase"):
		cam.showcase = false
		player.input_enabled = true
		player.throttle = 1.0
	open_world.qa_dump_near(cp, 90.0)
	var fwd: Vector3 = -c.global_transform.basis.z
	_qa_log("[QAPROBE] cam_fwd=%s pitch=%.2f" % [fwd, c.global_transform.basis.get_euler().x])
	_qa_flush()
	if (OS.get_cmdline_args() + OS.get_cmdline_user_args()).has("--qa-bird"):
		c.global_position = cp + Vector3(0.0, 70.0, 0.0)
		c.look_at(cp, Vector3.UP)
		_qa_flush()
		c.fov = 70.0
		cam.showcase = false
		cam.set_physics_process(false)

func _spawn_ai() -> void:
	var count = 5
	if mode == "drag":
		count = 1
	elif mode in ["time_trial", "trial", "roam", "drift", "pursuit"]:
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


func _toggle_map() -> void:
	if world_map == null:
		return
	AudioDirector.play_sfx("ui_click", -16.0)
	world_map.toggle()


func _build_hud() -> void:
	hud = HUD.new()
	hud.player = player
	if roaming:
		hud.track_data = null
		hud.accent = open_world.region.get("accent", Color(0.13, 0.91, 1.0))
	else:
		hud.track_data = builder.data
		hud.accent = builder.accent
	add_child(hud)
	hud.pause_pressed.connect(_toggle_pause)
	# World map — free roam only. It reads the same road samples the collider was
	# built from, so what it draws is exactly what the player can drive on.
	if roaming:
		hud.map_button.visible = true
		hud.map_pressed.connect(_toggle_map)
		world_map = MAP_SCRIPT.new()
		world_map.open_world = open_world
		world_map.player = player
		add_child(world_map)
	_wire_touch_controls()


## The on-screen paddles and horn are drawn by TouchControls but owned here,
## because only the race screen knows whether a shift is legal right now.
func _wire_touch_controls() -> void:
	if hud == null or hud._touch == null:
		return
	var touch = hud._touch
	touch.shift_up_pressed.connect(_on_shift_up)
	touch.shift_down_pressed.connect(_on_shift_down)
	touch.horn_pressed.connect(_on_horn)
	touch.manual_gearbox = player.manual_gearbox if player else false
	touch.queue_redraw()


func _on_shift_up() -> void:
	if player == null or not player.manual_gearbox:
		return
	player.shift_up()
	AudioDirector.play_sfx("gear_shift", -10.0, 1.05)


func _on_shift_down() -> void:
	if player == null or not player.manual_gearbox:
		return
	player.shift_down()
	AudioDirector.play_sfx("gear_shift", -12.0, 0.92)


func _on_horn() -> void:
	if _horn_cd > 0.0:
		return
	_horn_cd = 1.4
	AudioDirector.play_sfx("horn", -8.0)
	# A horn is not decoration: it makes nearby pedestrians scatter and raises
	# the attention of traffic, which is half of what makes a city feel real.
	if living != null and player != null:
		var near: float = living.nearest_pedestrian_distance(player.global_position)
		if near < 26.0:
			living.bump_pedestrians(player.global_position, 22.0)


## Drift and Pursuit are timed, not lapped. This is checked every frame from
## _process and is separate from the lap logic on purpose: a drift run has no
## track, and a pursuit is over when the timer expires (escape) or the police
## stop you (busted).
func _tick_mode(delta: float) -> void:
	if state != "racing":
		return
	match str(mode):
		"drift":
			_mode_timer = maxf(0.0, _mode_timer - delta)
			if hud != null:
				hud.flash_mode_status("%s   %d PTS" % [_time_text(_mode_timer), hud.drift_total()],
					UIStyle.GOLD)
			if _mode_timer <= 0.0:
				_finish_race()
		"pursuit":
			_mode_timer = maxf(0.0, _mode_timer - delta)
			_pursuit_survived += delta
			if hud != null and living != null:
				hud.flash_mode_status("%s   %d STAR%s   %s" % [
					_time_text(_mode_timer), living.heat_level,
					"" if living.heat_level == 1 else "S", _time_text(_pursuit_survived)],
					Color(1.0, 0.45, 0.40))
			# busted: the police sit on top of you for three seconds
			if living != null and living.heat_level >= 4 and not _busted:
				var caught: bool = false
				for unit in living.police_units():
					if is_instance_valid(unit) and unit.global_position.distance_to(player.global_position) < 9.0:
						caught = true
						break
				if caught:
					_busted = true
					hud.flash_warning("BUSTED", Color(1.0, 0.25, 0.25))
					player.input_enabled = false
					await get_tree().create_timer(1.8).timeout
					_finish_race()
					return
			if _mode_timer <= 0.0:
				_finish_race()


func _time_text(seconds: float) -> String:
	var m: int = int(seconds / 60.0)
	var s: float = fmod(seconds, 60.0)
	return "%d:%05.2f" % [m, s]


func _start_race() -> void:
	state = "countdown"
	AudioDirector.play_music("race_theme", 0.6, -9.0)
	player.input_enabled = false
	for ai in ai_cars:
		ai["node"].input_enabled = false
	await get_tree().create_timer(0.9).timeout
	await hud.start_countdown()
	state = "racing"
	race_time = 0.0
	lap_mark = 0.0
	_mode_timer = 120.0 if mode == "drift" else 180.0
	_mode_target = _mode_timer
	_pursuit_survived = 0.0
	_busted = false
	if mode == "pursuit" and living != null:
		# start the chase with two stars already on you, so the mode opens on the
		# thing the player came for instead of thirty seconds of empty road
		living.add_heat(2.0, player.global_position)
	player.input_enabled = true
	for ai in ai_cars:
		ai["node"].input_enabled = true


func _process(delta: float) -> void:
	if state == "racing":
		race_time += delta
		if player and player.input_enabled:
			_read_driver_input(delta)
	elif roaming and state != "paused" and player and player.input_enabled:
		# Free roam never runs a countdown, so it must read the pedals here too.
		# Only the "racing" branch used to call set_inputs(), which meant the car
		# could not move at all in roam even with the throttle held down.
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
	_update_post_live(delta)
	if player and hud:
		hud.set_nitro_charge(float(player.nitro_amount))
	_tick_mode(delta)
	_tick_lod()
	_tick_surfaces(delta)
	_tick_world_systems(delta)
	_tick_sound(delta)
	_tick_events()


## Distance-based level of detail for every car in the scene. The player is
## always full detail; rivals and police drop their glass house, wheels and
## small trim past 55 m and everything but the shell past 130 m. On a phone with
## six cars this is worth several draw calls per frame, and it costs one
## distance check per car.
func _tick_lod() -> void:
	if player == null or player.model() == null:
		return
	for ai in ai_cars:
		var ctrl = ai.get("node")
		if ctrl == null or not is_instance_valid(ctrl):
			continue
		var m = ctrl.model()
		if m != null and m.has_method("set_lod_detail"):
			m.set_lod_detail(ctrl.global_position.distance_to(player.global_position))
	if living != null:
		for unit in living.police_units():
			if is_instance_valid(unit) and unit.model != null:
				unit.model.set_lod_detail(unit.global_position.distance_to(player.global_position))


## What is the tyre actually on? Grass and dirt have far less grip than tarmac,
## and in the open world that difference is the whole game: cutting a corner
## across a field should punish you, not reward you.
func _tick_surfaces(delta: float) -> void:
	if player == null:
		return
	var on_road := true
	var grip_target: float = 1.0
	var surface := "tarmac"
	if roaming and open_world != null:
		# _road_lateral() returns 0..1 across the 16 m ribbon, so convert back to
		# metres from the centre-line before deciding the tyre is off the road.
		var lateral: float = (float(open_world._road_lateral(player.global_position)) - 0.5) * 16.0
		if absf(lateral) > 8.0:
			on_road = false
			surface = "dirt" if str(open_world.region.get("profile", "metro")) == "desert" else "grass"
			# A hypercar on grass is a sled; an overlander barely notices. This is
			# what makes the OVERLAND class worth buying.
			var offroad: float = float(gameplay_tuning.get("offroad", 0.45))
			grip_target = lerpf(0.42, 0.94, offroad)
	elif builder != null:
		var prj: Dictionary = builder.data.project(player.global_position)
		on_road = float(prj.get("lateral", 0.0)) < float(builder.data.half_width) + 2.0
		if not on_road:
			surface = "grass"
			grip_target = lerpf(0.42, 0.94, float(gameplay_tuning.get("offroad", 0.45)))
	if systems != null and systems.wetness > 0.15 and on_road:
		surface = "wet" if surface == "tarmac" else surface
		grip_target *= lerpf(1.0, 0.72, systems.wetness)
	var g: float = lerpf(player.surface_grip, grip_target, clampf(delta * 6.0, 0.0, 1.0))
	player.set_surface(surface, g)
	if systems != null:
		player.wetness = systems.wetness
	# tyre effects follow the true slip, so smoke appears exactly when spinning
	if skid != null:
		var speed_norm: float = clampf(player.speed_kmh() / 260.0, 0.0, 1.0)
		var slip: float = maxf(player.slip(), clampf(player.drift_amount * 0.55, 0.0, 1.0))
		skid.update_effects(delta, slip, speed_norm, on_road or surface == "dirt")


## One-shot things that follow from a physics event rather than a timer: a wall
## hit ends a drift combo, and a hard enough hit with police about raises the
## heat. Kept separate from _tick_world_systems so the ordering is obvious.
func _tick_events() -> void:
	if player == null:
		return
	if player.wall_hits != _last_wall_hits:
		var delta_hits: int = player.wall_hits - _last_wall_hits
		_last_wall_hits = player.wall_hits
		if hud != null:
			hud.break_combo()
		if living != null and delta_hits > 0:
			living.add_heat(float(delta_hits) * 0.22, player.global_position)


func _tick_world_systems(delta: float) -> void:
	if systems != null and player != null:
		systems.tick(delta, player.throttle, player.nitro_active)



func _tick_sound(_delta: float) -> void:
	_horn_cd = maxf(0.0, _horn_cd - _delta)
	if player == null:
		return
	var target: Node3D = player
	var car: Dictionary = Game.selected_car()
	var cls := str(car.get("class", "street"))
	# exhaust note scales with the class, turbo only exists on boosted cars
	var exhaust: float = {"street": 0.15, "sport": 0.45, "super": 0.75, "hyper": 1.0}.get(cls, 0.3)
	var turbo: float = 0.0
	if gameplay_tuning.has("turbo_level"):
		turbo = clampf(float(gameplay_tuning["turbo_level"]) / 5.0, 0.0, 1.0)
	var load: float = clampf(player.throttle * 0.85 + absf(player.speed) / 90.0 * 0.25, 0.0, 1.0)
	AudioDirector.set_engine(player.rpm_ratio(), load, not _engine_off, turbo, exhaust)
	AudioDirector.set_screech(player.slip() * clampf(player.speed_kmh() / 120.0, 0.0, 1.0))
	AudioDirector.set_wind(clampf(player.speed_kmh() / 320.0, 0.0, 1.0))
	if hud != null and hud.has_method("set_living_state"):
		hud.set_living_state(
			systems.fuel_ratio() if systems else 1.0,
			living.heat_level if living else 0,
			systems.clock_text() if systems else "",
			player.gear,
			player.is_shifting(),
			systems.weather if systems else "clear")


## Drive the speed-reactive parts of the post stack. Kept separate from
## update_post() (static grade) so the per-frame cost is a few uniform writes.
func _update_post_live(delta: float) -> void:
	if post_mat == null:
		return
	var spd := 0.0
	if player:
		spd = clampf(absf(float(player.speed)) / 95.0, 0.0, 1.0)
	post_mat.set_shader_parameter("speed_zoom", spd * spd * 0.045)
	_damage_flash = maxf(0.0, _damage_flash - delta * 2.6)
	post_mat.set_shader_parameter("damage_flash", _damage_flash)
	# keep the flare anchored to the sun as the camera moves
	if env_rig and env_rig.sun and cam and cam.camera():
		var c: Camera3D = cam.camera()
		if c:
			var sun_dir: Vector3 = -env_rig.sun.global_transform.basis.z
			var facing: float = clampf((-c.global_transform.basis.z).dot(sun_dir), 0.0, 1.0)
			if str(track.get("time", "night")) != "night":
				post_mat.set_shader_parameter("flare_strength", pow(facing, 3.0) * 0.9)


func _read_driver_input(delta: float) -> void:
	var steer = Input.get_axis("steer_left", "steer_right")
	var throttle = Input.get_action_strength("throttle")
	var brake = Input.get_action_strength("brake")
	var nitro = Input.is_action_pressed("nitro")
	var handbrake = Input.is_action_pressed("handbrake")
	if roaming and world_map != null and Input.is_action_just_pressed("map"):
		_toggle_map()
	if InputMap.has_action("camera") and Input.is_action_just_pressed("camera"):
		cam.cycle_mode()
		if hud:
			hud.flash_warning("CAMERA: %s" % cam.mode_name(), Color(0.65, 0.95, 1.0))
	if InputMap.has_action("shift_up") and Input.is_action_just_pressed("shift_up"):
		_on_shift_up()
	if InputMap.has_action("shift_down") and Input.is_action_just_pressed("shift_down"):
		_on_shift_down()
	if InputMap.has_action("horn") and Input.is_action_just_pressed("horn"):
		_on_horn()
	var mode_sel = str(SettingsStore.get_value("steer_mode", "buttons"))
	if mode_sel == "wheel":
		steer = player.steer
	elif mode_sel == "tilt":
		var tilt = Input.get_gravity().x if Input.get_gravity().length() > 0.1 else 0.0
		var t = clampf(tilt / 9.8, -1.0, 1.0)
		if bool(SettingsStore.get_value("invert_tilt", false)):
			t = -t
		steer = clampf(t * 1.8 * float(SettingsStore.get_value("sensitivity", 1.0)), -1.0, 1.0)
	# any real input ends the free-roam establishing shot
	if cam.showcase and (absf(steer) > 0.08 or throttle > 0.08 or brake > 0.08):
		cam.showcase = false
		AudioDirector.play_sfx("ui_click", -18.0)
	if hud.touch_steer() != 0.0:
		_touch_steer_smooth = lerpf(_touch_steer_smooth, hud.touch_steer(), delta * 14.0)
		steer = _touch_steer_smooth
	elif absf(_touch_steer_smooth) > 0.001:
		_touch_steer_smooth = lerpf(_touch_steer_smooth, 0.0, delta * 6.0)
		steer = _touch_steer_smooth
	# analogue pedals: the further you press, the more throttle/brake
	throttle = maxf(throttle, hud.touch_throttle())
	brake = maxf(brake, hud.touch_brake())
	nitro = nitro or hud.touch_nitro()
	player.set_inputs(throttle, brake, steer, nitro, handbrake)


func _update_lap(_delta: float) -> void:
	if roaming:
		# no laps, no checkpoints: free roam just tracks distance travelled
		player_progress = player.distance_travelled
		_wrong_way_t = 0.0
		return
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
	# In drift/pursuit the clock stopped the run, so race_time was never the run
	# length; use the mode's own timers for the results table.
	if mode == "drift":
		race_time = _mode_target
	elif mode == "pursuit":
		race_time = _pursuit_survived
	player.input_enabled = false
	if living != null:
		living.clear_heat()
	for ai in ai_cars:
		ai["node"].input_enabled = false
	AudioDirector.stop_race_audio(1.2)
	var total = race_time
	var reward: int = int(track.get("reward", 3000))
	var pos_bonus = [1.0, 0.72, 0.55, 0.4, 0.3, 0.22]
	var mult: float = pos_bonus[clampi(car_position - 1, 0, 5)] if mode == "circuit" else 1.0
	var clean = player.wall_hits == 0
	# Drift pays per point, pursuit pays for survival time plus stars shaken.
	var drift_points: int = hud.drift_total() if hud != null else 0
	if mode == "drift":
		reward = int(drift_points * 1.15)
		if reward < 400:
			reward = 400
	elif mode == "pursuit":
		reward = int(_pursuit_survived * 42.0) + (2500 if _busted else 6000)
	var result: Dictionary = {
		"drift_points": drift_points,
		"survived": _pursuit_survived,
		"busted": _busted,
		"track": str(track["id"]),
		"track_name": str(track["name"]),
		"mode": mode,
		"position": car_position if mode == "circuit" else 1,
		"total": car_position,
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
	if roaming:
		car_position = 1
		return
	var ahead = 0
	for ai in ai_cars:
		var prj: Dictionary = builder.data.project(ai["node"].global_position)
		var ai_prog = float(prj["along"]) + float(ai["node"].laps_completed) * builder.data.total_length
		var mine = player_progress + float(lap - 1) * builder.data.total_length
		if ai_prog > mine:
			ahead += 1
	car_position = ahead + 1


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
		"position_text": "%d/%d" % [car_position, ai_cars.size() + 1] if mode == "circuit" else "TT",
		"lap_text": "%d/%d" % [lap, laps_target] if mode == "circuit" else "1/1",
		"roam": roaming,
		"roam_speed": player.speed_kmh() if roaming else 0.0,
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
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(overlay)
	var panel = UIStyle.make_glass_panel(34, Color(0.05, 0.08, 0.14, 0.92), 48, 0.35)
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
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
