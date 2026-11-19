extends Node3D
## Composition root. Boots every system with honest progressive loading and owns
## the BOOT -> SPLASH -> MENU -> PLAY state machine.

enum State { BOOT, SPLASH, MENU, PLAY }

var state: int = State.BOOT
var bus: EventBus
var loc: Localization3
var input: InputManagerV2
var settings: SettingsStore
var quality: QualityManager
var perf: PerformanceDashboard
var debug_overlay: DebugOverlay
var current_slot: int = 1
var ui: UIManager
var graph: RoadGraph
var city: ProceduralCity
var day: DayNight
var weather: Weather
var player: PlayerController
var rig: CameraRig
var weapons: WeaponSystem
var police: PoliceAI
var traffic: TrafficAI
var missions: MissionRunner
var economy: Economy
var sun: DirectionalLight3D
var world_env: WorldEnvironment
var menu_camera: Camera3D
var peds: Array[PedestrianAI] = []
var fps_cap: int = 30
var _t: float = 0.0
var _save_timer: float = 0.0
var _frames: int = 0
var _fps_time: float = 0.0
var _near_vehicle: VehicleController = null
var _perf_timer: float = 0.0
var _capture_frame: int = 0

func _ready() -> void:
	var manager := Node.new()
	manager.name = "GameManager"
	get_tree().root.add_child(manager)
	bus = EventBus.new()
	bus.name = "EventBus"
	manager.add_child(bus)
	settings = SettingsStore.new()
	quality = QualityManager.new()
	quality.select(int(settings.get_value("quality_index", 1)))
	quality.changed.connect(func(): bus.quality_changed.emit(quality.summary()))
	loc = Localization3.new(String(settings.get_value("locale", "ar")))
	input = InputManagerV2.new()
	add_child(input)
	perf = PerformanceDashboard.new()
	debug_overlay = DebugOverlay.new()
	add_child(debug_overlay)
	debug_overlay.setup(self)
	ui = UIManager.new()
	ui.name = "UIManager"
	add_child(ui)
	ui.setup(loc, bus, input)
	_connect_ui()
	_init_world()

func _connect_ui() -> void:
	ui.start_requested.connect(_on_start)
	ui.locale_requested.connect(_on_locale)
	ui.quality_requested.connect(_on_quality)
	ui.mission_requested.connect(_on_mission_request)
	ui.shop_requested.connect(_on_shop)
	ui.save_requested.connect(save_game)
	ui.quit_requested.connect(func(): get_tree().quit())

func _init_world() -> void:
	ui.set_loading(0.08, "Initialising renderer…")
	await get_tree().process_frame
	if not bool(settings.get_value("benchmarked", false)):
		var bench := Benchmark.new()
		add_child(bench)
		bench.finished.connect(_on_benchmark)
		bench.run(1.2)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	add_child(sun)
	sun.rotation_degrees = Vector3(-50, 30, 0)
	quality.apply([sun])
	world_env = WorldEnvironment.new()
	add_child(world_env)
	day = DayNight.new()
	day.hour = 18.0
	day.setup(sun, world_env)
	weather = Weather.new()
	weather.setup(day, quality.index)
	add_child(weather.particles)
	ui.set_loading(0.26, "Building Nova Mira road graph…")
	await get_tree().process_frame
	graph = RoadGraph.new()
	graph.build()
	ui.set_loading(0.46, "Generating six districts…")
	await get_tree().process_frame
	player = PlayerController.new()
	player.name = "Player"
	add_child(player)
	player.setup(input, bus)
	player.global_position = Vector3(0, 1.2, 0)
	rig = CameraRig.new()
	rig.name = "CameraRig"
	add_child(rig)
	rig.setup(player, input)
	weapons = WeaponSystem.new()
	weapons.name = "Weapons"
	add_child(weapons)
	weapons.setup(player, rig, input, bus)
	player.weapon_system = weapons
	city = ProceduralCity.new()
	city.name = "City"
	add_child(city)
	city.setup(graph, quality.index, player)
	ui.set_loading(0.68, "Spawning traffic and citizens…")
	await get_tree().process_frame
	traffic = TrafficAI.new()
	traffic.name = "Traffic"
	add_child(traffic)
	traffic.setup(graph, bus, quality.index)
	traffic.populate(self, player.global_position)
	police = PoliceAI.new()
	police.name = "Police"
	add_child(police)
	police.setup(player, bus, self, graph)
	missions = MissionRunner.new()
	missions.name = "Missions"
	add_child(missions)
	missions.setup(bus, player, police, graph)
	economy = Economy.new()
	economy.setup(player, bus)
	_spawn_peds()
	ui.player = player
	ui.police = police
	ui.missions = missions
	ui.day = day
	ui.weather = weather
	var mini := ui.hud.get_node_or_null("Minimap") as Minimap
	if mini != null:
		mini.setup(player, police, missions)
	menu_camera = Camera3D.new()
	menu_camera.name = "MenuCamera"
	add_child(menu_camera)
	menu_camera.current = true
	ui.set_loading(1.0, "Ready")
	await get_tree().create_timer(0.8).timeout
	state = State.MENU
	ui.show_menu()
	weather.set_state(2)
	print("[NovaMira] world ready: %d road nodes, %d chunks, %d traffic cars" % [graph.size(), city.chunk_count(), traffic.cars.size()])

func _spawn_peds() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1234
	for i in range(int(quality.tier().get("peds", 12))):
		var ped := PedestrianAI.new()
		add_child(ped)
		var node := graph.node_pos(graph.nearest(Vector3(rng.randf_range(-300, 300), 0, rng.randf_range(-300, 300))))
		ped.global_position = node + Vector3(rng.randf_range(-7, 7), 0.2, rng.randf_range(-7, 7))
		ped.setup(graph.node_pos(graph.random_node()), i + 99)
		peds.append(ped)

func _on_start(new_game: bool) -> void:
	if new_game:
		player.global_position = Vector3(0, 1.2, 0)
		player.health = 100.0
		player.armour = 0.0
		player.add_money(500 - player.money)
		police.clear()
		missions.completed.clear()
		day.hour = 18.0
		weather.set_state(0)
	else:
		var data := SaveSystemV2.load_slot(current_slot)
		_load_data(data)
	state = State.PLAY
	ui.show_game()
	if rig.camera != null:
		rig.camera.current = true
	player.set_in_vehicle(false, null)
	show_toast("Welcome to Nova Mira — " + loc.tr_text("OBJECTIVE") + ": " + loc.tr_text("FREE_ROAM"))

func _on_benchmark(result: Dictionary) -> void:
	settings.set_value("benchmarked", true)
	settings.set_value("auto_tier", int(result.get("suggested_tier", 1)))
	settings.flush()
	quality.select(int(result.get("suggested_tier", 1)))
	bus.benchmark_finished.emit(result)
	show_toast("Auto quality: %s (%.1f ms)" % [String(quality.tier().get("id", "medium")), float(result.get("median_ms", 0.0))])

func _on_locale(code: String) -> void:
	loc.set_locale(code)
	settings.set_value("locale", code)
	settings.flush()
	ui.refresh_locale()
	if bus != null:
		bus.locale_changed.emit(code)

func _on_quality(level: int) -> void:
	quality.select(clampi(level, 0, quality.tiers.size() - 1))
	settings.set_value("quality_index", quality.index)
	settings.flush()

func _on_mission_request(index: int) -> void:
	if state != State.PLAY:
		_on_start(true)
	missions.start(index)

func _on_shop(id: String) -> void:
	economy.buy(id, weapons)

func show_toast(text: String) -> void:
	if bus != null:
		bus.toast.emit(text)

func _process(delta: float) -> void:
	if "--capture-frames" in OS.get_cmdline_args():
		_capture_frame += 1
		match _capture_frame:
			90:
				if state == State.MENU:
					_on_start(true)
			150:
				day.hour = 22.0
				day.apply()
				weather.set_state(2)
			210:
				ui.toggle_phone()
			270:
				ui.toggle_phone()
				debug_overlay.toggle()
	_frames += 1
	_fps_time += delta
	if _fps_time >= 1.0:
		var fps := float(_frames) / _fps_time
		bus.fps_updated.emit(fps)
		_frames = 0
		_fps_time = 0.0
	if state == State.MENU:
		_t += delta
		var a := _t * 0.09
		menu_camera.global_position = Vector3(cos(a) * 220, 55 + sin(a * 0.7) * 12, sin(a) * 220)
		menu_camera.look_at(Vector3(150, 60, -150))
		return
	if state != State.PLAY:
		return
	day.tick(delta)
	weather.tick(delta, player.global_position)
	city.update_chunks()
	ui.update(delta)
	if input.just_pressed("debug_toggle") or input.consume_tap("debug_toggle"):
		debug_overlay.toggle()
	if input.consume_tap("pause"):
		ui.toggle_pause()
	if input.consume_tap("phone_toggle"):
		ui.toggle_phone()
	if input.consume_tap("map_toggle"):
		ui.show_toast("Map: " + loc.tr_text(GameData.DISTRICTS[GameData.district_id(player.global_position)]["name"]))
	if input.consume_tap("enter_vehicle"):
		_toggle_vehicle()
	_perf_timer += delta
	if _perf_timer > 0.5:
		_perf_timer = 0.0
		perf.record(delta * 1000.0,
			float(Performance.get_monitor(Performance.MEMORY_STATIC)) / 1048576.0,
			int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)))
	_save_timer += delta
	if _save_timer > 90.0:
		_save_timer = 0.0
		save_game()

func _toggle_vehicle() -> void:
	if player.in_vehicle:
		var car := player.current_vehicle as VehicleController
		player.set_in_vehicle(false, null)
		if car != null:
			car.exit()
			player.global_position = car.global_position + Vector3(3, 1, 0)
		rig.setup(player, input)
		return
	var best: VehicleController = null
	var best_dist := 7.0
	for c in traffic.cars:
		if not is_instance_valid(c):
			continue
		var d := c.global_position.distance_to(player.global_position)
		if d < best_dist:
			best = c
			best_dist = d
	if best != null:
		best.enter(player)
		player.set_in_vehicle(true, best)
		rig.setup(best, input)
		show_toast("Entered " + String(best.spec["name"]))
	else:
		show_toast("No vehicle nearby")

func save_game() -> void:
	var data := SaveSystem.default_data()
	data["money"] = player.money
	data["health"] = player.health
	data["armour"] = player.armour
	data["pos"] = [player.global_position.x, player.global_position.y, player.global_position.z]
	data["weapon"] = weapons.current
	data["ammo"] = weapons.ammo
	data["mission"] = missions.index
	data["completed"] = missions.completed
	data["stars"] = police.stars
	data["hour"] = day.hour
	data["weather"] = weather.state
	data["properties"] = economy.properties
	data["locale"] = loc.locale
	data["quality"] = String(quality.tier().get("id", "medium"))
	if SaveSystemV2.save(current_slot, data):
		bus.slot_changed.emit(current_slot)
		show_toast("Game saved (slot %d)" % current_slot)

func _load_data(data: Dictionary) -> void:
	player.money = int(data.get("money", 500))
	player.health = float(data.get("health", 100.0))
	player.armour = float(data.get("armour", 0.0))
	var p: Array = data.get("pos", [0, 1, 0])
	player.global_position = Vector3(float(p[0]), float(p[1]), float(p[2]))
	weapons.ammo = data.get("ammo", weapons.ammo)
	var idx := int(data.get("weapon", 2))
	weapons.select(idx)
	day.hour = float(data.get("hour", 18.0))
	day.apply()
	weather.set_state(int(data.get("weather", 0)))
	police.set_stars(int(data.get("stars", 0)))
	loc.set_locale(String(data.get("locale", "ar")))
	ui.refresh_locale()

func get_debug_data() -> Dictionary:
	return {
		"state": state, "slot": current_slot, "quality": quality.tier().get("id", "?"),
		"scale": quality.resolution_scale, "fps_cap": quality.fps_cap,
		"chunks": city.chunk_count() if city != null else 0,
		"traffic": traffic.cars.size() if traffic != null else 0,
		"peds": peds.size(), "wanted": police.stars if police != null else 0,
		"perf": perf.summary(),
	}
