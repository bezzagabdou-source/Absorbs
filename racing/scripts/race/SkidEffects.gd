extends Node3D
## Tyre smoke, skid marks and drift sparks.
##
## Nothing else sells speed and drifting as much as what the tyres leave behind.
## This rig is written for a mobile budget:
##   * smoke is ONE GPUParticles3D pool whose emission is driven by slip, not a
##     particle node per wheel (one draw call instead of four)
##   * skid marks are a fixed ring buffer of quads written into a single
##     ImmediateMesh, so the trail can never grow without bound
##   * sparks reuse the same pool trick with a second particles node
##
## The car asks `update_effects()` every frame; everything else is internal.

const SKID_SEGMENTS := 220          ## ring buffer length per wheel trail
const SKID_WIDTH := 0.235
const SKID_LIFE := 26.0             ## seconds before a segment fades out
const SMOKE_AMOUNT := 34
const SPARK_AMOUNT := 22

var target: Node3D                  ## the CarController
var model: Node3D                   ## the CarModel (for wheel world positions, optional)

var _skid_mesh: ImmediateMesh
var _skid_instance: MeshInstance3D
var _skid_mat: StandardMaterial3D
var _segments: Array = []           ## one PackedVector3Array ring per wheel (4)
var _seg_head: Array = []           ## write head per wheel
var _seg_age: Array = []            ## parallel age ring
var _last_pos: Array = []           ## last accepted point per wheel
var _smoke: GPUParticles3D
var _sparks: GPUParticles3D
var _smoke_amount: float = 0.0
var _spark_amount: float = 0.0
var _wheel_offsets: Array = []      ## local positions of the 4 contact patches
var _accum: float = 0.0


func _ready() -> void:
	_build_skid()
	_build_smoke()
	_build_sparks()


## Contact patch offsets for an arbitrary car shape, so the marks line up with
## the tyres instead of a fixed guess that only suits one body style.
func bind(car: Node3D, car_model: Node3D = null) -> void:
	target = car
	model = car_model
	_wheel_offsets.clear()
	var half_w: float = 0.86
	var axle: float = 1.42
	if car_model != null and "car_info" in car_model:
		var info: Dictionary = car_model.get("car_info")
		var shape_key := str(info.get("body", "super"))
		if GameData.SHAPES.has(shape_key):
			var shape: Dictionary = GameData.SHAPES[shape_key]
			half_w = float(shape.get("width", 1.9)) * 0.5 - 0.06
			axle = float(shape.get("length", 4.6)) * 0.5 - float(shape.get("wheel", 0.35)) - 0.32
	for front in [true, false]:
		for side in [-1.0, 1.0]:
			_wheel_offsets.append(Vector3(half_w * side, 0.03, -axle if front else axle))


func _build_skid() -> void:
	_skid_mesh = ImmediateMesh.new()
	_skid_instance = MeshInstance3D.new()
	_skid_instance.name = "SkidMarks"
	_skid_instance.mesh = _skid_mesh
	_skid_instance.layers = 1
	_skid_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_skid_mat = StandardMaterial3D.new()
	_skid_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_skid_mat.albedo_color = Color(0.045, 0.042, 0.040, 0.72)
	_skid_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_skid_mat.vertex_color_use_as_albedo = true
	_skid_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_skid_mat.no_depth_test = false
	# decals must sit ON the road, not fight it for depth
	_skid_mat.render_priority = 1
	_skid_instance.material_override = _skid_mat
	add_child(_skid_instance)
	for i in 4:
		_segments.append(PackedVector3Array())
		_seg_head.append(0)
		_seg_age.append(PackedFloat32Array())
		_last_pos.append(Vector3.ZERO)


func _build_smoke() -> void:
	_smoke = GPUParticles3D.new()
	_smoke.name = "TyreSmoke"
	_smoke.amount = SMOKE_AMOUNT
	_smoke.lifetime = 2.4
	_smoke.emitting = false
	_smoke.local_coords = false
	_smoke.layers = 1
	_smoke.visibility_aabb = AABB(Vector3(-40, -6, -40), Vector3(80, 22, 80))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.9, 0.12, 1.6)
	pm.direction = Vector3(0.0, 0.4, 1.0)
	pm.spread = 55.0
	pm.initial_velocity_min = 1.1
	pm.initial_velocity_max = 3.0
	pm.gravity = Vector3(0.0, 1.35, 0.0)
	pm.damping_min = 0.9
	pm.damping_max = 2.0
	pm.scale_min = 0.9
	pm.scale_max = 2.6
	pm.color = Color(0.88, 0.88, 0.90, 0.42)
	# fade the puff out over its life so it reads as smoke, not as balls
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 1.0))
	curve.add_point(Vector2(0.35, 0.85))
	curve.add_point(Vector2(1.0, 0.0))
	var ct := CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct
	_smoke.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(1.5, 1.5)
	quad.orientation = PlaneMesh.FACE_Z
	var mesh_mat := StandardMaterial3D.new()
	mesh_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mesh_mat.albedo_color = Color(0.85, 0.86, 0.90, 0.30)
	mesh_mat.vertex_color_use_as_albedo = true
	mesh_mat.disable_receive_shadows = true
	quad.material = mesh_mat
	_smoke.draw_pass_1 = quad
	add_child(_smoke)


func _build_sparks() -> void:
	_sparks = GPUParticles3D.new()
	_sparks.name = "DriftSparks"
	_sparks.amount = SPARK_AMOUNT
	_sparks.lifetime = 0.55
	_sparks.emitting = false
	_sparks.local_coords = false
	_sparks.layers = 1
	_sparks.visibility_aabb = AABB(Vector3(-30, -6, -30), Vector3(60, 16, 60))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(1.1, 0.1, 1.5)
	pm.direction = Vector3(0.0, 0.6, 1.0)
	pm.spread = 70.0
	pm.initial_velocity_min = 3.0
	pm.initial_velocity_max = 8.0
	pm.gravity = Vector3(0.0, -14.0, 0.0)
	pm.scale_min = 0.25
	pm.scale_max = 0.6
	pm.color = Color(1.0, 0.62, 0.22, 1.0)
	_sparks.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(0.10, 0.10)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(1.0, 0.66, 0.26)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.55, 0.16)
	mat.emission_energy_multiplier = 6.0
	quad.material = mat
	_sparks.draw_pass_1 = quad
	add_child(_sparks)


## Called by the race screen every frame. `slip` is 0..1 of how hard the tyres
## are sliding, `speed_norm` is speed / top speed.
func update_effects(delta: float, slip: float, speed_norm: float, on_road: bool) -> void:
	if target == null:
		return
	_accum += delta
	var emitting_smoke: bool = slip > 0.16 and speed_norm > 0.06 and on_road
	_smoke.emitting = emitting_smoke
	_sparks.emitting = slip > 0.55 and speed_norm > 0.22 and on_road
	_smoke_amount = lerpf(_smoke_amount, slip if emitting_smoke else 0.0, delta * 6.0)
	if _smoke.emitting:
		# move the emitter under the car so puffs spawn at the contact patches
		_smoke.global_position = target.global_position + Vector3.UP * 0.18
		_smoke.global_rotation = Vector3(0.0, target.global_rotation.y, 0.0)
	if _sparks.emitting:
		_sparks.global_position = target.global_position + Vector3.UP * 0.12

	# skid marks only when the tyre is actually sliding, and only every few cm
	var laying: bool = slip > 0.30 and speed_norm > 0.05 and on_road
	for i in _wheel_offsets.size():
		var off: Vector3 = _wheel_offsets[i]
		var world: Vector3 = target.global_transform * off
		if laying:
			var prev: Vector3 = _last_pos[i]
			if prev == Vector3.ZERO or prev.distance_to(world) > 0.16:
				_push_skid(i, world)
				_last_pos[i] = world
		else:
			_last_pos[i] = Vector3.ZERO
	_decay_skids(delta)
	_rebuild_skid_mesh()


func _push_skid(i: int, world: Vector3) -> void:
	var seg: PackedVector3Array = _segments[i]
	var age: PackedFloat32Array = _seg_age[i]
	var prev: Vector3 = _last_pos[i]
	if prev == Vector3.ZERO:
		return
	var dir: Vector3 = (world - prev)
	if dir.length_squared() < 0.0001:
		return
	dir = dir.normalized()
	var side: Vector3 = dir.cross(Vector3.UP).normalized() * SKID_WIDTH
	if seg.size() > SKID_SEGMENTS * 2:
		seg = seg.slice(2)
		age = age.slice(2)
	seg.append(prev - side)
	seg.append(prev + side)
	seg.append(world - side)
	seg.append(world + side)
	age.append(SKID_LIFE)
	age.append(SKID_LIFE)
	_segments[i] = seg
	_seg_age[i] = age


func _decay_skids(delta: float) -> void:
	for i in _seg_age.size():
		var age: PackedFloat32Array = _seg_age[i]
		var changed := false
		for j in age.size():
			if age[j] > 0.0:
				age[j] = maxf(0.0, age[j] - delta)
				changed = true
		if changed:
			_seg_age[i] = age
	# drop fully faded segments from the head of each ring
	for i in _segments.size():
		var seg: PackedVector3Array = _segments[i]
		var age: PackedFloat32Array = _seg_age[i]
		while age.size() > 0 and age[0] <= 0.0:
			age.remove_at(0)
			if seg.size() >= 4:
				seg = seg.slice(4)
		if age.is_empty():
			seg = PackedVector3Array()
		_segments[i] = seg
		_seg_age[i] = age


func _rebuild_skid_mesh() -> void:
	_skid_mesh.clear_surfaces()
	var any := false
	for seg in _segments:
		if (seg as PackedVector3Array).size() >= 4:
			any = true
			break
	if not any:
		return
	_skid_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, _skid_mat)
	for i in _segments.size():
		var seg: PackedVector3Array = _segments[i]
		var age: PackedFloat32Array = _seg_age[i]
		var quad_count: int = int(seg.size() / 4)
		for q in quad_count:
			var a: Vector3 = seg[q * 4 + 0]
			var b: Vector3 = seg[q * 4 + 1]
			var c: Vector3 = seg[q * 4 + 2]
			var d: Vector3 = seg[q * 4 + 3]
			# lift a hair off the surface so the decal never z-fights the road
			var lift := Vector3.UP * 0.018
			var t: float = age[mini(q, age.size() - 1)] / SKID_LIFE
			var alpha: float = clampf(t * 1.6, 0.0, 1.0) * 0.85
			var col := Color(0.05, 0.048, 0.046, alpha)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(a + lift)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(c + lift)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(b + lift)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(b + lift)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(c + lift)
			_skid_mesh.surface_set_color(col)
			_skid_mesh.surface_add_vertex(d + lift)
	_skid_mesh.surface_end()


## Wipe every trail — used when a race restarts or the car is teleported.
func clear_trails() -> void:
	for i in _segments.size():
		_segments[i] = PackedVector3Array()
		_seg_age[i] = PackedFloat32Array()
		_last_pos[i] = Vector3.ZERO
	_smoke.emitting = false
	_sparks.emitting = false
	_rebuild_skid_mesh()
