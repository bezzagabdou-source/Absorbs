class_name ProceduralCity
extends Node3D
## Deterministic modular city. Buildings are instanced per chunk; distant chunks are
## unloaded. Everything is original geometry made from primitives.

var graph: RoadGraph
var quality_level: int = 1
var _chunks: Dictionary = {}
var _last_chunk := Vector2i(99999, 99999)
var _player: Node3D
var _view_distance: float = 280.0
var _materials: Dictionary = {}

func setup(p_graph: RoadGraph, p_quality: int, p_player: Node3D) -> void:
	graph = p_graph
	quality_level = p_quality
	_player = p_player
	_view_distance = Quality.preset(p_quality)["view"]
	_make_materials()
	_build_ground()
	_build_roads()
	_build_landmarks()
	update_chunks(true)

func _make_materials() -> void:
	var asphalt := StandardMaterial3D.new()
	asphalt.albedo_color = Color(0.11, 0.12, 0.14)
	asphalt.roughness = 0.82
	_materials["road"] = asphalt
	var walk := StandardMaterial3D.new()
	walk.albedo_color = Color(0.36, 0.35, 0.32)
	walk.roughness = 0.95
	_materials["walk"] = walk
	var bodies := StandardMaterial3D.new()
	bodies.vertex_color_use_as_albedo = true
	bodies.roughness = 0.78
	bodies.metallic = 0.05
	_materials["building"] = bodies
	var glass := StandardMaterial3D.new()
	glass.vertex_color_use_as_albedo = true
	glass.emission_enabled = true
	glass.emission = Color(0.95, 0.72, 0.42)
	glass.emission_energy_multiplier = 0.7
	glass.roughness = 0.25
	_materials["window"] = glass
	var green := StandardMaterial3D.new()
	green.albedo_color = Color(0.13, 0.26, 0.13)
	_materials["tree"] = green

func _box(pos: Vector3, size: Vector3, mat: Material, parent: Node3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	mi.position = pos
	mi.material_override = mat
	parent.add_child(mi)
	return mi

func _build_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(2600, 2600)
	ground.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.22, 0.25, 0.16)
	ground.material_override = mat
	add_child(ground)
	var beach := MeshInstance3D.new()
	var bp := PlaneMesh.new()
	bp.size = Vector2(260, 2200)
	beach.mesh = bp
	beach.position = Vector3(-1120, 0.03, 0)
	var bm := StandardMaterial3D.new()
	bm.albedo_color = Color(0.68, 0.60, 0.41)
	beach.material_override = bm
	add_child(beach)
	var water := MeshInstance3D.new()
	var wp := PlaneMesh.new()
	wp.size = Vector2(900, 2600)
	water.mesh = wp
	water.position = Vector3(-1560, -0.15, 0)
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.05, 0.25, 0.36)
	wm.metallic = 0.6
	wm.roughness = 0.18
	water.material_override = wm
	add_child(water)

func _build_roads() -> void:
	var roads := Node3D.new()
	roads.name = "Roads"
	add_child(roads)
	var half: int = int(GameData.CITY_SIZE / GameData.BLOCK * 0.5)
	var span: float = float(half) * GameData.BLOCK
	for i in range(-half, half + 1):
		var p := float(i) * GameData.BLOCK
		_box(Vector3(p, 0.02, 0), Vector3(11.0, 0.08, span * 2.0), _materials["road"], roads)
		_box(Vector3(0, 0.02, p), Vector3(span * 2.0, 0.08, 11.0), _materials["road"], roads)
		if i % 2 == 0:
			_box(Vector3(p, 0.05, 0), Vector3(0.25, 0.02, span * 2.0), _materials["walk"], roads)
			_box(Vector3(0, 0.05, p), Vector3(span * 2.0, 0.02, 0.25), _materials["walk"], roads)
	# A raised highway across the north and a tunnel mouth near the port.
	_box(Vector3(0, 9.0, -800), Vector3(1900, 1.2, 18), _materials["road"], roads)
	for i in range(8):
		_box(Vector3(-900 + i * 260.0, 4.5, -800), Vector3(3, 9, 20), _materials["walk"], roads)

func _build_landmarks() -> void:
	var landmarks := Node3D.new()
	landmarks.name = "Landmarks"
	add_child(landmarks)
	# Nova Tower: the tallest original structure in Downtown.
	_box(Vector3(150, 70, -150), Vector3(38, 140, 38), _materials["building"], landmarks)
	_box(Vector3(150, 144, -150), Vector3(6, 8, 6), _materials["window"], landmarks)
	# Port cranes and container stacks on the western waterfront.
	for i in range(10):
		var z := -900.0 + i * 190.0
		_box(Vector3(-900, 7, z), Vector3(6, 14, 6), _materials["road"], landmarks)
		_box(Vector3(-840, 14, z), Vector3(130, 1.6, 2), _materials["road"], landmarks)
		for j in range(3):
			_box(Vector3(-940 + j * 24, 2.0 + j * 0.2, z + 40), Vector3(20, 4, 8), _materials["window"], landmarks)
	# Lighthouse on the southern cape.
	_box(Vector3(-760, 22, 960), Vector3(12, 44, 12), _materials["walk"], landmarks)
	_box(Vector3(-760, 46, 960), Vector3(14, 5, 14), _materials["window"], landmarks)

func _chunk_key(pos: Vector3) -> Vector2i:
	return Vector2i(floori(pos.x / GameData.CHUNK), floori(pos.z / GameData.CHUNK))

func update_chunks(force: bool = false) -> void:
	if _player == null:
		return
	var key := _chunk_key(_player.global_position)
	if not force and key == _last_chunk:
		return
	_last_chunk = key
	var radius: int = maxi(1, int(ceil(_view_distance / GameData.CHUNK)))
	var wanted: Dictionary = {}
	for dx in range(-radius, radius + 1):
		for dz in range(-radius, radius + 1):
			var ck := key + Vector2i(dx, dz)
			var center := Vector3(float(ck.x) * GameData.CHUNK, 0, float(ck.y) * GameData.CHUNK)
			if center.distance_to(_player.global_position) > _view_distance + GameData.CHUNK:
				continue
			wanted[ck] = true
			if not _chunks.has(ck):
				_chunks[ck] = _build_chunk(ck)
	for ck in _chunks.keys():
		var node: Node3D = _chunks[ck]
		var active := wanted.has(ck)
		node.visible = active
		var body := node.get_node_or_null("Collisions")
		if body != null:
			(body as StaticBody3D).collision_layer = 1 if active else 0
	for ck in _chunks.keys():
		if not wanted.has(ck):
			(_chunks[ck] as Node3D).queue_free()
			_chunks.erase(ck)

func _build_chunk(ck: Vector2i) -> Node3D:
	var root := Node3D.new()
	root.name = "Chunk_%d_%d" % [ck.x, ck.y]
	add_child(root)
	var rng := RandomNumberGenerator.new()
	rng.seed = (ck.x * 73856093) ^ (ck.y * 19349663)
	var bodies := Array()
	var windows := Array()
	var trees := Array()
	var blocks: int = int(GameData.CHUNK / GameData.BLOCK)
	for bx in range(blocks):
		for bz in range(blocks):
			var wx := float(ck.x) * GameData.CHUNK + float(bx) * GameData.BLOCK
			var wz := float(ck.y) * GameData.CHUNK + float(bz) * GameData.BLOCK
			var center := Vector3(wx + GameData.BLOCK * 0.5, 0, wz + GameData.BLOCK * 0.5)
			var district: Dictionary = GameData.DISTRICTS[GameData.district_id(center)]
			var density := float(district["density"])
			if center.x < -1050:
				continue
			var count := 0
			for attempt in range(3):
				if rng.randf() > density:
					continue
				var w := rng.randf_range(12, 30)
				var d := rng.randf_range(12, 30)
				var h := rng.randf_range(6, float(district["max_h"]))
				var x := wx + rng.randf_range(14, 80)
				var z := wz + rng.randf_range(14, 80)
				var col: Color = district["color"]
				col = col.lightened(rng.randf_range(-0.08, 0.10))
				bodies.append({"t": Transform3D(Basis().scaled(Vector3(w, h, d)), Vector3(x, h * 0.5, z)), "c": col})
				if h > 9.0:
					windows.append({"t": Transform3D(Basis().scaled(Vector3(w * 0.82, 1.2, d * 0.82)), Vector3(x, h * 0.62, z)), "c": Color(1, 0.85 + rng.randf() * 0.15, 0.6)})
				count += 1
			if count == 0 and rng.randf() < 0.35:
				trees.append(Vector3(wx + 50, 0, wz + 50))
	_make_multimesh(root, "Buildings", bodies, _materials["building"])
	_make_multimesh(root, "Windows", windows, _materials["window"])
	_make_trees(root, trees)
	var collisions := StaticBody3D.new()
	collisions.name = "Collisions"
	root.add_child(collisions)
	for b in bodies:
		var t: Transform3D = b["t"]
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(1, 1, 1)
		shape.shape = box
		shape.transform = t
		collisions.add_child(shape)
	return root

func _make_multimesh(parent: Node3D, pname: String, instances: Array, mat: Material) -> void:
	if instances.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.instance_count = instances.size()
	var unit := BoxMesh.new()
	unit.size = Vector3(1, 1, 1)
	var mi := MultiMeshInstance3D.new()
	mi.name = pname
	mi.multimesh = mm
	mi.material_override = mat
	for i in range(instances.size()):
		mm.set_instance_transform(i, instances[i]["t"])
		mm.set_instance_color(i, instances[i]["c"])
	parent.add_child(mi)

func _make_trees(parent: Node3D, positions: Array) -> void:
	if positions.is_empty():
		return
	var count := positions.size() * 2
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.instance_count = count
	var unit := BoxMesh.new()
	unit.size = Vector3(1, 1, 1)
	var mi := MultiMeshInstance3D.new()
	mi.name = "Foliage"
	mi.multimesh = mm
	mi.material_override = _materials["tree"]
	for i in range(count):
		var p: Vector3 = positions[i / 2]
		if i % 2 == 0:
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(0.9, 5, 0.9)), p + Vector3(0, 2.5, 0)))
			mm.set_instance_color(i, Color(0.30, 0.22, 0.13))
		else:
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(5, 5, 5)), p + Vector3(0, 7, 0)))
			mm.set_instance_color(i, Color(0.16, 0.36, 0.18))
	parent.add_child(mi)

func chunk_count() -> int:
	return _chunks.size()
