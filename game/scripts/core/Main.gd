extends Node3D
## Composition root. Boots every system with honest progressive loading and owns
## the BOOT -> SPLASH -> MENU -> PLAY state machine.

enum State { BOOT, SPLASH, MENU, PLAY }

var state: int = State.BOOT
var bus: EventBus
var loc: Localization
var input: InputManager
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
var quality: int = 1
var fps_cap: int = 30
var _t: float = 0.0
var _save_timer: float = 0.0
var _frames: int = 0
var _fps_time: float = 0.0
var _near_vehicle: VehicleController = null

func _ready() -> void:
	var manager := Node.new()
	manager.name = "GameManager"
	get_tree().root.add_child(manager)
	bus = EventBus.new()
	bus.name = "EventBus"
	manager.add_child(bus)
	loc = Localization.new()
	loc.set_locale("ar")
	input = InputManager.new()
	add_child(input)
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
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	add_child(sun)
	sun.rotation_degrees = Vector3(-50, 30, 0)
	world_env = WorldEnvironment.new()
	add_child(world_env)
	day = DayNight.new()
	day.hour = 18.0
	day.setup(sun, world_env)
	weather = Weather.new()
	weather.setup(day, quality)
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
	city.setup(graph, quality, player)
	ui.set_loading(0.68, "Spawning traffic and citizens…")
	await get_tree().process_frame
	traffic = TrafficAI.new()
	traffic.name = "Traffic"
	add_child(traffic)
	traffic.setup(graph, bus, quality)
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
	for i in range(Quality.preset(quality)["peds"]):
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
		var data := SaveSystem.load_data()
		_load_data(data)
	state = State.PLAY
	ui.show_game()
	if rig.camera != null:
		rig.camera.current = true
	player.set_in_vehicle(false, null)
	show_toast("Welcome to Nova Mira — " + loc.tr_text("OBJECTIVE") + ": " + loc.tr_text("FREE_ROAM"))

func _on_locale(code: String) -> void:
	loc.set_locale(code)
	ui.refresh_locale()
	if bus != null:
		bus.locale_changed.emit(code)

func _on_quality(level: int) -> void:
	quality = clampi(level, 0, 2)
	Quality.apply(quality, fps_cap)

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
	if input.consume_tap("pause"):
		ui.toggle_pause()
	if input.consume_tap("phone_toggle"):
		ui.toggle_phone()
	if input.consume_tap("map_toggle"):
		ui.show_toast("Map: " + loc.tr_text(GameData.DISTRICTS[GameData.district_id(player.global_position)]["name"]))
	if input.consume_tap("enter_vehicle"):
		_toggle_vehicle()
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
	data["quality"] = quality
	if SaveSystem.save(data):
		show_toast("Game saved")

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
