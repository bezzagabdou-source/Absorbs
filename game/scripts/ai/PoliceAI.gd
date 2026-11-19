class_name PoliceAI
extends Node
## Wanted system (1-5 stars) with escalation, cooldown, arrest and vehicle units.

signal stars_changed(stars: int)

var stars: int = 0
var bus: EventBus
var player: PlayerController
var scene_root: Node3D
var graph: RoadGraph
var _units: Array[Node] = []
var _cooldown: float = 0.0
var _hidden_time: float = 0.0
var _heli: Node3D = null
var _rng := RandomNumberGenerator.new()

func setup(p_player: PlayerController, p_bus: EventBus, p_root: Node3D, p_graph: RoadGraph) -> void:
	player = p_player
	bus = p_bus
	scene_root = p_root
	graph = p_graph
	_rng.seed = 8181
	if bus != null:
		bus.player_died.connect(clear)

func add_stars(n: int) -> void:
	set_stars(clampi(stars + n, 0, 5))

func set_stars(n: int) -> void:
	var previous := stars
	stars = clampi(n, 0, 5)
	if stars != previous:
		_cooldown = 18.0
		_hidden_time = 0.0
		stars_changed.emit(stars)
		if bus != null:
			bus.wanted_changed.emit(stars)
	_sync_units()

func clear() -> void:
	set_stars(0)

func _sync_units() -> void:
	var wanted := 0
	match stars:
		0: wanted = 0
		1: wanted = 2
		2: wanted = 3
		3: wanted = 4
		4: wanted = 5
		5: wanted = 7
	while _units.size() > wanted:
		var u := _units.pop_back() as Node
		if is_instance_valid(u):
			u.queue_free()
	while _units.size() < wanted:
		_spawn_unit()

func _spawn_unit() -> void:
	var wanted_car := stars >= 2 and _units.size() % 2 == 0
	if wanted_car:
		var car := VehicleController.new()
		scene_root.add_child(car)
		car.setup(GameData.vehicle(5), null, bus, null)
		car.global_position = player.global_position + Vector3(_rng.randf_range(-60, 60), 1, _rng.randf_range(-60, 60))
		car.autopilot = true
		_units.append(car)
	else:
		var ped := PedestrianAI.new()
		scene_root.add_child(ped)
		ped.setup(player.global_position + Vector3(_rng.randf_range(-30, 30), 1, _rng.randf_range(-30, 30)), _rng.randi())
		ped.speed = 3.2
		_units.append(ped)

func _physics_process(delta: float) -> void:
	if stars <= 0:
		if _heli != null:
			_heli.queue_free()
			_heli = null
		return
	_cooldown = maxf(0.0, _cooldown - delta)
	var nearest := 1e9
	for u in _units:
		if not is_instance_valid(u):
			continue
		var node := u as Node3D
		var dist := node.global_position.distance_to(player.global_position)
		nearest = minf(nearest, dist)
		if u is PedestrianAI and not (u as PedestrianAI).dead:
			var dir := (player.global_position - node.global_position).normalized()
			(u as PedestrianAI).target = player.global_position + dir * 1.0
			if dist < 2.2 and not player.in_vehicle and _cooldown <= 0.0:
				_arrest()
		elif u is VehicleController:
			var car := u as VehicleController
			var local := car.to_local(player.global_position)
			car.autopilot_steer = clampf(atanf(local.x / maxf(4.0, absf(local.z))), -0.9, 0.9)
			car.autopilot_throttle = 0.0 if dist < 6.0 else 1.0
	if nearest > 55.0 and _cooldown <= 0.0:
		_hidden_time += delta
		if _hidden_time > 12.0:
			set_stars(stars - 1)
			_hidden_time = 0.0
	else:
		_hidden_time = 0.0
	if stars >= 5 and _heli == null:
		_spawn_helicopter()
	if _heli != null:
		_heli.global_position = player.global_position + Vector3(20, 32, 20)
		_heli.look_at(player.global_position)

func _spawn_helicopter() -> void:
	var root := Node3D.new()
	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(3, 1.4, 6)
	body.mesh = box
	root.add_child(body)
	var rotor := MeshInstance3D.new()
	var blade := BoxMesh.new()
	blade.size = Vector3(12, 0.1, 0.3)
	rotor.mesh = blade
	rotor.position.y = 1.3
	root.add_child(rotor)
	scene_root.add_child(root)
	_heli = root

func _arrest() -> void:
	if bus == null:
		return
	var lost := int(player.money * 0.15)
	player.money -= lost
	bus.player_arrested.emit()
	bus.toast.emit("Arrested — lost %d credits" % lost)
	player.global_position = Vector3(-700, 2, -700)
	clear()
