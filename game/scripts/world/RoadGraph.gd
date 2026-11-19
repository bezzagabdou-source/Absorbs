class_name RoadGraph
extends RefCounted
## Grid road network used by traffic, pedestrians, police and mission markers.

var _half: int
var _nodes: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var lights_phase: float = 0.0

func _init(size: float = GameData.CITY_SIZE, block: float = GameData.BLOCK) -> void:
	_half = int(size / block * 0.5)
	_rng.seed = 4021

func build() -> void:
	_nodes.clear()
	for gx in range(-_half, _half + 1):
		for gz in range(-_half, _half + 1):
			var id := Vector2i(gx, gz)
			_nodes[id] = {
				"pos": Vector3(float(gx) * GameData.BLOCK, 0.0, float(gz) * GameData.BLOCK),
				"neighbours": [],
			}
	for id in _nodes.keys():
		var n: Dictionary = _nodes[id]
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			if _nodes.has(id + d):
				(n["neighbours"] as Array).append(id + d)

func tick(delta: float) -> void:
	lights_phase = fposmod(lights_phase + delta * 0.18, 1.0)

func green_axis(axis: int) -> bool:
	# North/South green during first half of cycle, East/West during second.
	return (lights_phase < 0.45) == (axis == 1)

func nearest(pos: Vector3) -> Vector2i:
	var gx := int(round(pos.x / GameData.BLOCK))
	var gz := int(round(pos.z / GameData.BLOCK))
	var id := Vector2i(clampi(gx, -_half, _half), clampi(gz, -_half, _half))
	if _nodes.has(id):
		return id
	return Vector2i.ZERO

func node_pos(id: Vector2i) -> Vector3:
	if _nodes.has(id):
		return (_nodes[id] as Dictionary)["pos"]
	return Vector3.ZERO

func next_node(from: Vector2i, to: Vector2i, avoid: Vector2i = Vector2i(999, 999)) -> Vector2i:
	if not _nodes.has(from):
		return from
	var neighbours: Array = (_nodes[from] as Dictionary)["neighbours"]
	if neighbours.is_empty():
		return from
	var best: Vector2i = neighbours[0]
	var best_score := 1e9
	var goal_dist := node_pos(to).distance_to(node_pos(from))
	for n in neighbours:
		if n == avoid:
			continue
		var d := node_pos(n).distance_to(node_pos(to))
		var score := d + absf(goal_dist - d) * 0.05 + _rng.randf() * 12.0
		if score < best_score:
			best_score = score
			best = n
	return best

func random_node() -> Vector2i:
	var keys: Array = _nodes.keys()
	return keys[_rng.randi_range(0, keys.size() - 1)]

func size() -> int:
	return _nodes.size()

func is_on_road(pos: Vector3, tolerance: float = 7.0) -> bool:
	var n := nearest(pos)
	var p := node_pos(n)
	return absf(pos.x - p.x) < tolerance or absf(pos.z - p.z) < tolerance
