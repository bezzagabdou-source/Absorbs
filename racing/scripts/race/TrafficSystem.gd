extends Node3D
## Living traffic, pedestrians and police.
##
## Three separate populations share one cheap simulation because on a phone the
## cost has to stay flat no matter how much is on screen:
##
##   TRAFFIC  — cars driving the highway ring in both directions, keeping to
##              their lane, braking for the car in front and for the player.
##              Rendered with a single MultiMesh, so 40 vehicles cost one draw
##              call. They are simulated as points on a ring, never as physics
##              bodies.
##   PEOPLE   — pedestrians on the pavement near landmarks. They walk between
##              waypoints, turn to face travel, and get out of the way when you
##              drive at them.
##   POLICE   — real pursuit vehicles (full CarController + CarModel) spawned by
##              the heat system. They are expensive, so at most four exist and
##              they are the only ones with physics.
##
## Everything is deterministic per region seed, so the same street has the same
## traffic every time you visit.

const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")
const PoliceUnitScript = preload("res://scripts/race/PoliceUnit.gd")

const MAX_TRAFFIC := 44
const MAX_PEDESTRIANS := 36
const LANE_OFFSET := 9.5            ## metres each side of the ring centre-line

var world                          ## OpenWorld (for height_at + the ring data)
var road_points := PackedVector3Array()
var ring_radius: float = 620.0

var _traffic: Array = []           ## {angle, dir, speed, lane, model_index}
var _traffic_mm: MultiMesh
var _traffic_mi: MultiMeshInstance3D
var _pedestrians: Array = []
var _peds_root: Node3D
var _police_units: Array = []
var _police_root: Node3D
var _rng := RandomNumberGenerator.new()
var _density: float = 1.0
var _time: float = 0.0
var enabled_traffic: bool = true
var enabled_pedestrians: bool = true

## Heat: 0 = clean, 1..5 = wanted stars. Driving into traffic, hitting
## pedestrians or ramming police raises it; staying out of sight cools it.
var heat: float = 0.0
var heat_level: int = 0
signal heat_changed(level: int)
signal police_spotted


## Quality scaling: how much of the traffic and crowd is actually drawn.
## Called by the performance governor when the frame budget is missed.
func set_density_scale(scale_v: float) -> void:
	_density = clampf(scale_v, 0.1, 1.0)
	if _traffic_mm != null:
		_traffic_mm.visible_instance_count = int(_traffic.size() * _density)
	if _pedestrian_mm != null:
		_pedestrian_mm.visible_instance_count = int(_pedestrians.size() * _density)


func set_particle_scale(_v: float) -> void:
	pass


func build(world_ref, region: Dictionary) -> void:
	add_to_group("perf_traffic")
	world = world_ref
	_rng.seed = int(region.get("seed", 2026)) + 7717
	ring_radius = float(world.ROAD_RING_RADIUS) if world != null else 620.0
	if world != null:
		road_points = world.road_points
	_build_traffic()
	_build_pedestrians()
	_police_root = Node3D.new()
	_police_root.name = "Police"
	add_child(_police_root)


# --------------------------------------------------------------------------
# TRAFFIC
# --------------------------------------------------------------------------
func _build_traffic() -> void:
	var palette := [
		Color(0.82, 0.83, 0.86), Color(0.12, 0.13, 0.16), Color(0.55, 0.10, 0.10),
		Color(0.10, 0.22, 0.44), Color(0.72, 0.74, 0.70), Color(0.30, 0.32, 0.34),
		Color(0.60, 0.52, 0.30), Color(0.15, 0.34, 0.24),
	]
	var meshes: Array = []
	for variant in 3:
		meshes.append(_traffic_mesh(variant))
	_traffic_mm = MultiMesh.new()
	_traffic_mm.transform_format = MultiMesh.TRANSFORM_3D
	_traffic_mm.use_colors = true
	_traffic_mm.mesh = meshes[0]
	_traffic_mm.instance_count = MAX_TRAFFIC
	_traffic_mi = MultiMeshInstance3D.new()
	_traffic_mi.name = "Traffic"
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.34
	mat.metallic = 0.55
	_traffic_mi.material_override = mat
	_traffic_mi.multimesh = _traffic_mm
	_traffic_mi.layers = 1
	add_child(_traffic_mi)

	for i in MAX_TRAFFIC:
		var dir: float = 1.0 if i % 2 == 0 else -1.0
		_traffic.append({
			"angle": _rng.randf_range(0.0, TAU),
			"dir": dir,
			"lane": dir * LANE_OFFSET * 0.55,
			"speed": _rng.randf_range(11.0, 21.0),
			"base_speed": 0.0,
			"color": palette[i % palette.size()],
		})
		_traffic[i]["base_speed"] = _traffic[i]["speed"]


func _traffic_mesh(variant: int) -> Mesh:
	var body := BoxMesh.new()
	match variant:
		0:
			body.size = Vector3(1.86, 0.72, 4.45)
		1:
			body.size = Vector3(1.94, 0.86, 4.95)
		_:
			body.size = Vector3(1.74, 0.62, 4.05)
	return body


func _ring_point(angle: float, lateral: float) -> Vector3:
	var r: float = ring_radius + lateral
	var x: float = cos(angle) * r
	var z: float = sin(angle) * r
	var y: float = 1.15
	if world != null:
		y = world._road_surface_height(angle) + float(world.ROAD_LIFT)
	return Vector3(x, y, z)


func _process_traffic(delta: float) -> void:
	if _traffic_mm == null:
		return
	var player_pos := Vector3.ZERO
	var player_here := false
	if is_instance_valid(_player_ref):
		player_pos = _player_ref.global_position
		player_here = true
	for i in _traffic.size():
		var t: Dictionary = _traffic[i]
		var ang: float = float(t["angle"])
		var dir: float = float(t["dir"])
		var speed: float = float(t["speed"])
		# brake for the player if they are directly ahead in this lane
		var target_speed: float = float(t["base_speed"])
		if player_here:
			var here := _ring_point(ang, float(t["lane"]))
			var to_player: Vector3 = player_pos - here
			var flat := Vector3(to_player.x, 0.0, to_player.z)
			var ahead := _ring_point(ang + dir * 0.02, float(t["lane"])) - here
			ahead.y = 0.0
			if flat.length() < 26.0 and flat.normalized().dot(ahead.normalized()) > 0.45:
				target_speed = 0.0
		# and for each other in its lane just ahead
		for j in _traffic.size():
			if j == i:
				continue
			var o: Dictionary = _traffic[j]
			if float(o["dir"]) != dir:
				continue
			var gap: float = wrapf(float(o["angle"]) - ang, -PI, PI) * ring_radius
			var closing: float = gap * dir
			if closing > 0.0 and closing < 13.0:
				target_speed = minf(target_speed, float(o["speed"]) * 0.6)
		speed = move_toward(speed, target_speed, delta * 7.0)
		t["speed"] = speed
		ang += (speed / ring_radius) * dir * delta
		ang = wrapf(ang, 0.0, TAU)
		t["angle"] = ang
		var pos := _ring_point(ang, float(t["lane"]))
		var tangent := Vector3(-sin(ang), 0.0, cos(ang)) * dir
		var basis := Basis.looking_at(tangent, Vector3.UP)
		# sit the box body on the road: half its height above the surface
		pos.y += 0.36
		_traffic_mm.set_instance_transform(i, Transform3D(basis.scaled(Vector3.ONE * 1.0), pos))
		_traffic_mm.set_instance_color(i, t["color"])
	_traffic_mm.visible_instance_count = int(_traffic.size() * _density)


var _player_ref: Node3D = null


func set_player(node: Node3D) -> void:
	_player_ref = node


# --------------------------------------------------------------------------
# PEDESTRIANS
# --------------------------------------------------------------------------
func _build_pedestrians() -> void:
	_peds_root = Node3D.new()
	_peds_root.name = "Pedestrians"
	add_child(_peds_root)
	# one shared body mesh, coloured per instance
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.26
	capsule.height = 1.68
	capsule.radial_segments = 7
	capsule.rings = 3
	mm.mesh = capsule
	mm.instance_count = MAX_PEDESTRIANS
	var mi := MultiMeshInstance3D.new()
	mi.name = "People"
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.85
	mi.material_override = mat
	mi.multimesh = mm
	mi.layers = 1
	_peds_root.add_child(mi)
	_pedestrian_mm = mm
	for i in MAX_PEDESTRIANS:
		var ang: float = _rng.randf_range(0.0, TAU)
		var lat: float = _rng.randf_range(17.0, 30.0) * (1.0 if i % 2 == 0 else -1.0)
		_pedestrians.append({
			"angle": ang,
			"lateral": lat,
			"walk_dir": 1.0 if _rng.randf() > 0.5 else -1.0,
			"speed": _rng.randf_range(0.9, 1.7),
			"phase": _rng.randf_range(0.0, TAU),
			"flee": 0.0,
			"color": Color.from_hsv(_rng.randf(), 0.45, _rng.randf_range(0.35, 0.9)),
		})

var _pedestrian_mm: MultiMesh


func _process_pedestrians(delta: float) -> void:
	if _pedestrian_mm == null or not enabled_pedestrians:
		return
	var ppos := Vector3.ZERO
	var has_player := is_instance_valid(_player_ref)
	if has_player:
		ppos = _player_ref.global_position
	for i in _pedestrians.size():
		var p: Dictionary = _pedestrians[i]
		var ang: float = float(p["angle"])
		var lat: float = float(p["lateral"])
		var flee: float = maxf(0.0, float(p["flee"]) - delta * 0.5)
		p["flee"] = flee
		var speed: float = float(p["speed"]) * (1.0 + float(p["walk_dir"]) * 0.0)
		ang += (speed / (ring_radius + absf(lat) * 0.4)) * float(p["walk_dir"]) * delta * (1.0 + flee * 3.0)
		ang = wrapf(ang, 0.0, TAU)
		p["angle"] = ang
		var pos := _ring_point(ang, lat)
		pos.y += 0.9
		# step out of the way if the player is coming at them
		if has_player:
			var d: float = pos.distance_to(ppos)
			if d < 9.0:
				p["flee"] = 1.0
				var away: Vector3 = (pos - ppos)
				away.y = 0.0
				if away.length() > 0.01:
					pos += away.normalized() * 0.9
					lat += signf(lat) * delta * 3.0
					p["lateral"] = clampf(lat, 15.0, 34.0)
		var phase: float = float(p["phase"]) + _time * 7.0
		var bob: float = sin(phase) * 0.035
		var basis := Basis(Vector3.UP, ang + PI * 0.5 * float(p["walk_dir"]))
		_pedestrian_mm.set_instance_transform(i, Transform3D(basis, pos + Vector3.UP * bob))
		_pedestrian_mm.set_instance_color(i, p["color"])
	_pedestrian_mm.visible_instance_count = int(_pedestrians.size() * _density)


# --------------------------------------------------------------------------
# POLICE
# --------------------------------------------------------------------------
## Raise the heat. `amount` is in "stars"; 1.0 = one full star.
func add_heat(amount: float, player_pos: Vector3) -> void:
	var before := heat_level
	heat = clampf(heat + amount, 0.0, 5.0)
	heat_level = int(ceil(heat - 0.001))
	if heat_level != before:
		heat_changed.emit(heat_level)
		if heat_level > 0:
			_spawn_police(player_pos)


func _spawn_police(player_pos: Vector3) -> void:
	var want: int = mini(heat_level, 4)
	while _police_units.size() < want:
		var unit = PoliceUnitScript.new()
		unit.name = "Police%d" % _police_units.size()
		_police_root.add_child(unit)
		var ang: float = atan2(player_pos.z, player_pos.x) + _rng.randf_range(-0.5, 0.5)
		var spawn := _ring_point(ang, _rng.randf_range(-14.0, 14.0))
		# spawn far enough away that they arrive rather than appear on top of you
		if spawn.distance_to(player_pos) < 90.0:
			var away: Vector3 = (spawn - player_pos).normalized()
			spawn = player_pos + away * 130.0
		unit.spawn(spawn, 1.0)
		_police_units.append(unit)


func _process_police(delta: float) -> void:
	if _police_units.is_empty():
		if heat > 0.0:
			heat = maxf(0.0, heat - delta * 0.035)
			if heat <= 0.0 and heat_level != 0:
				heat_level = 0
				heat_changed.emit(0)
		return
	var target := Vector3.ZERO
	var has_player := is_instance_valid(_player_ref)
	if has_player:
		target = _player_ref.global_position
	for unit in _police_units:
		if not is_instance_valid(unit):
			continue
		unit.pursue(target, delta)
	if not has_player:
		return
	# off-screen or far away cools the pursuit down
	var nearest := 9999.0
	for unit in _police_units:
		if is_instance_valid(unit):
			nearest = minf(nearest, unit.global_position.distance_to(target))
	if nearest > 220.0:
		heat = maxf(0.0, heat - delta * 0.11)
	elif nearest < 45.0:
		heat = maxf(0.0, heat - delta * 0.008)
	var lvl := int(ceil(heat - 0.001))
	if lvl != heat_level:
		heat_level = lvl
		heat_changed.emit(lvl)
	# retire units that are no longer needed
	while _police_units.size() > maxi(0, heat_level):
		var u = _police_units.pop_back()
		if is_instance_valid(u):
			u.queue_free()


func clear_heat() -> void:
	heat = 0.0
	if heat_level != 0:
		heat_level = 0
		heat_changed.emit(0)
	for u in _police_units:
		if is_instance_valid(u):
			u.queue_free()
	_police_units.clear()


# --------------------------------------------------------------------------
# LOOP
# --------------------------------------------------------------------------
func _process(delta: float) -> void:
	_time += delta
	if enabled_traffic:
		_process_traffic(delta)
	_process_pedestrians(delta)
	_process_police(delta)


## Count of police currently chasing, for the HUD and the minimap.
func police_count() -> int:
	return _police_units.size()


func traffic_count() -> int:
	return _traffic.size()


func police_units() -> Array:
	return _police_units


## Scatter everyone within `radius` of a point — used by the car horn.
func bump_pedestrians(pos: Vector3, radius: float) -> void:
	for p in _pedestrians:
		var w := _ring_point(float(p["angle"]), float(p["lateral"]))
		if w.distance_to(pos) < radius:
			p["flee"] = 1.0


## Nearest pedestrian to a point (for "did I hit someone" checks).
func nearest_pedestrian_distance(pos: Vector3) -> float:
	var best := 9999.0
	for p in _pedestrians:
		var w := _ring_point(float(p["angle"]), float(p["lateral"]))
		best = minf(best, w.distance_to(pos))
	return best
