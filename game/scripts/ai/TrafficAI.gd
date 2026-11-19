class_name TrafficAI
extends Node
## Road-graph traffic with traffic-light compliance and simple avoidance.

var graph: RoadGraph
var bus: EventBus
var cars: Array[VehicleController] = []
var _rng := RandomNumberGenerator.new()
var _next: Dictionary = {}
var _max_cars: int = 12
var _tick: float = 0.0

func setup(p_graph: RoadGraph, p_bus: EventBus, quality: int) -> void:
	graph = p_graph
	bus = p_bus
	_max_cars = Quality.preset(quality)["traffic"]
	_rng.seed = 555

func spawn(p_spec: Dictionary, world: Node3D, pos: Vector3) -> VehicleController:
	var car := VehicleController.new()
	world.add_child(car)
	car.setup(p_spec, null, bus, null)
	car.global_position = pos
	car.autopilot = true
	cars.append(car)
	return car

func populate(scene_root: Node3D, centre: Vector3) -> void:
	for c in cars:
		if is_instance_valid(c):
			c.queue_free()
	cars.clear()
	for i in range(_max_cars):
		var id := graph.random_node()
		var spec := GameData.vehicle(3 + (i % 3))
		var car := spawn(spec, scene_root, graph.node_pos(id) + Vector3(_rng.randf_range(-5, 5), 1, _rng.randf_range(-5, 5)))
		_next[car.get_instance_id()] = graph.next_node(id, graph.random_node())

func _physics_process(delta: float) -> void:
	_tick += delta
	graph.tick(delta)
	for car in cars:
		if not is_instance_valid(car) or not car.alive:
			continue
		var key := car.get_instance_id()
		if not _next.has(key) or car.global_position.distance_to(graph.node_pos(_next[key])) < 16.0:
			var here := graph.nearest(car.global_position)
			_next[key] = graph.next_node(here, graph.random_node(), here)
		var target_id: Vector2i = _next[key]
		var target := graph.node_pos(target_id)
		var local := car.to_local(target)
		car.autopilot_steer = clampf(atanf(local.x / maxf(4.0, absf(local.z))) * 0.8, -0.7, 0.7)
		var axis := 1 if absf(target.x - car.global_position.x) > absf(target.z - car.global_position.z) else 0
		var at_stop := car.global_position.distance_to(target) < 22.0
		car.autopilot_throttle = 0.0 if (at_stop and not graph.green_axis(axis)) else 1.0
		if car.global_position.distance_to(Vector3(0, 0, 0)) > 950.0:
			car.global_position = graph.node_pos(graph.random_node()) + Vector3(0, 1, 0)
