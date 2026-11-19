extends Node3D
## Procedural low-poly car: lofted body shell, glasshouse, wheels with tyre +
## rim, lights, wing, mirrors, nitro flames. Every car class differs in
## proportions and silhouette.

var car_info: Dictionary = {}
var paint = Color("22e9ff")
var paint_finish = 0
var rim_id = "stock"
var rim_spokes = 5
var rim_style = 0
var wheels: Array = []
var _body_mat: StandardMaterial3D
var _glass_mat: StandardMaterial3D
var _trim_mat: StandardMaterial3D
var _accent_mat: StandardMaterial3D
var _head_mat: StandardMaterial3D
var _tail_mat: StandardMaterial3D
var _nitro_nodes: Array[Node3D] = []
var _damage = 0.0
var _shapes: Dictionary = {}
var _body_root: Node3D
var _brake_light = false


func build(info: Dictionary, paint_id: String = "", rim: String = "") -> void:
	car_info = info
	var key = str(info.get("body", "super"))
	var shape: Dictionary = GameData.SHAPES.get(key, GameData.SHAPES["super"])
	_shapes = shape
	var paint_info = GameData.paint_by_id(paint_id if paint_id != "" else str(info.get("paint", "cyan")))
	_set_paint(paint_info)
	rim_id = rim if rim != "" else "stock"
	var rim_info = GameData.rim_by_id(rim_id)
	rim_spokes = int(rim_info.get("spokes", 5))
	rim_style = int(rim_info.get("style", 0))
	_build_materials()
	_body_root = Node3D.new()
	_body_root.name = "Shell"
	add_child(_body_root)
	_build_body(shape)
	_build_glasshouse(shape)
	_build_details(shape)
	_build_wheels(shape)
	_build_lights(shape)
	_build_nitro(shape)


func _set_paint(paint_info: Dictionary) -> void:
	var c = str(paint_info.get("color", "22e9ff"))
	paint_finish = int(paint_info.get("finish", 0))
	if paint_finish == 1:
		paint = Color(c).darkened(0.15)
	elif paint_finish == 2:
		paint = Color(c).lightened(0.08)
	else:
		paint = Color(c)


func _build_materials() -> void:
	_body_mat = StandardMaterial3D.new()
	_body_mat.albedo_color = paint
	_body_mat.metallic = 0.15 if paint_finish == 1 else 0.62
	_body_mat.roughness = 0.55 if paint_finish == 1 else (0.18 if paint_finish == 2 else 0.30)
	_body_mat.clearcoat_enabled = true
	_body_mat.clearcoat = 1.0 if paint_finish != 1 else 0.2
	_body_mat.clearcoat_roughness = 0.09
	_body_mat.rim_enabled = true
	_body_mat.rim = 0.35
	_body_mat.rim_tint = 0.6
	_glass_mat = StandardMaterial3D.new()
	_glass_mat.albedo_color = Color(0.035, 0.05, 0.075, 0.9)
	_glass_mat.metallic = 0.85
	_glass_mat.roughness = 0.05
	_glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_trim_mat = StandardMaterial3D.new()
	_trim_mat.albedo_color = Color(0.045, 0.05, 0.065)
	_trim_mat.metallic = 0.55
	_trim_mat.roughness = 0.45
	_accent_mat = StandardMaterial3D.new()
	_accent_mat.albedo_color = paint.lightened(0.35)
	_accent_mat.emission_enabled = true
	_accent_mat.emission = paint
	_accent_mat.emission_energy_multiplier = 0.9
	_head_mat = StandardMaterial3D.new()
	_head_mat.albedo_color = Color(0.85, 0.93, 1.0)
	_head_mat.emission_enabled = true
	_head_mat.emission = Color(0.72, 0.88, 1.0)
	_head_mat.emission_energy_multiplier = 5.0
	_head_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_tail_mat = StandardMaterial3D.new()
	_tail_mat.albedo_color = Color(1.0, 0.12, 0.2)
	_tail_mat.emission_enabled = true
	_tail_mat.emission = Color(1.0, 0.1, 0.18)
	_tail_mat.emission_energy_multiplier = 2.2
	_tail_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED


## Lofted shell: cross sections stacked along the length, each an 8-point
## rounded rectangle whose width/height taper with the class shape.
func _build_body(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var nose: float = shape["nose"]
	var tail: float = shape["tail"]
	var bevel: float = shape["bevel"]
	var stance: float = shape["stance"]
	var stations = [
		0.0, 0.06, 0.16, 0.30, 0.46, 0.62, 0.76, 0.88, 0.96, 1.0,
	]
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings: Array = []
	for s in stations:
		var t: float = s
		var z: float = lerpf(-length * 0.5, length * 0.5, t)
		var taper = 1.0
		if t < 0.10:
			taper = lerpf(nose + 0.28, 1.0, t / 0.10)
		elif t > 0.90:
			taper = lerpf(1.0, tail + 0.26, (t - 0.90) / 0.10)
		var shoulder = 1.0
		if t > 0.30 and t < 0.72:
			shoulder = 1.0 + 0.05 * stance
		var half_w: float = width * 0.5 * taper * shoulder
		var base_y: float = 0.34 - stance * 0.06
		var top_y: float = height * 0.62 + 0.30
		if t < 0.14:
			top_y = lerpf(height * 0.44, top_y, t / 0.14)
		elif t > 0.86:
			top_y = lerpf(top_y, height * 0.5, (t - 0.86) / 0.14)
		var h: float = top_y - base_y
		var b: float = minf(bevel, minf(half_w, h) * 0.9)
		var pts: Array = [
			Vector3(-half_w + b, base_y, z),
			Vector3(half_w - b, base_y, z),
			Vector3(half_w, base_y + b, z),
			Vector3(half_w, base_y + h - b, z),
			Vector3(half_w - b, base_y + h, z),
			Vector3(-half_w + b, base_y + h, z),
			Vector3(-half_w, base_y + h - b, z),
			Vector3(-half_w, base_y + b, z),
		]
		rings.append(pts)
	for r in range(rings.size() - 1):
		var a: Array = rings[r]
		var b2: Array = rings[r + 1]
		var n: int = a.size()
		for k in range(n):
			var k2 = (k + 1) % n
			var v0: Vector3 = a[k]
			var v1: Vector3 = a[k2]
			var v2: Vector3 = b2[k]
			var v3: Vector3 = b2[k2]
			for pair in [[v0, v2, v1], [v1, v2, v3]]:
				var p0: Vector3 = pair[0]
				var p1: Vector3 = pair[1]
				var p2: Vector3 = pair[2]
				var nrm = (p1 - p0).cross(p2 - p0).normalized()
				for v in [p0, p1, p2]:
					st.set_normal(nrm)
					st.set_uv(Vector2(v.x, v.z))
					st.set_vertex(v)
	# caps
	for endcap in [0, rings.size() - 1]:
		var pts: Array = rings[endcap]
		var center = Vector3.ZERO
		for p in pts:
			center += p
		center /= float(pts.size())
		for k in range(pts.size()):
			var k2 = (k + 1) % pts.size()
			var p0: Vector3 = pts[k]
			var p1: Vector3 = pts[k2]
			var flip = endcap == 0
			var tri = [center, p1, p0] if flip else [center, p0, p1]
			var nrm = Vector3(0, 0, -1) if flip else Vector3(0, 0, 1)
			for v in tri:
				st.set_normal(nrm)
				st.set_uv(Vector2(v.x, v.y))
				st.set_vertex(v)
	st.generate_tangents()
	var mi = MeshInstance3D.new()
	mi.name = "Body"
	mi.mesh = st.commit()
	mi.material_override = _body_mat
	mi.layers = 1
	_body_root.add_child(mi)


func _build_glasshouse(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var cabin: Array = shape["cabin"]
	var roof: float = shape["roof"]
	var c0: float = cabin[0]
	var c1: float = cabin[1]
	var z0: float = lerpf(-length * 0.5, length * 0.5, c0)
	var z1: float = lerpf(-length * 0.5, length * 0.5, c1)
	var w0: float = width * 0.40
	var w1: float = width * 0.36
	var y_base: float = height * 0.62 + 0.30
	var y_top: float = y_base + height * 0.42 * roof
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var quads: Array = [
		[Vector3(-w0, y_base, z0), Vector3(w0, y_base, z0), Vector3(w1, y_top, z0 + 0.25)],
		[Vector3(-w0, y_base, z1), Vector3(-w1, y_top, z1 - 0.25), Vector3(w0, y_base, z1)],
		[Vector3(w0, y_base, z0), Vector3(w0, y_base, z1), Vector3(w1, y_top, z1 - 0.25)],
		[Vector3(-w0, y_base, z0), Vector3(-w1, y_top, z0 + 0.25), Vector3(-w0, y_base, z1)],
		[Vector3(-w1, y_top, z0 + 0.25), Vector3(w1, y_top, z0 + 0.25), Vector3(w1, y_top, z1 - 0.25)],
		[Vector3(-w1, y_top, z0 + 0.25), Vector3(w1, y_top, z1 - 0.25), Vector3(-w1, y_top, z1 - 0.25)],
	]
	for q in quads:
		var p0: Vector3 = q[0]
		var p1: Vector3 = q[1]
		var p2: Vector3 = q[2]
		var nrm = (p1 - p0).cross(p2 - p0).normalized()
		for v in [p0, p1, p2]:
			st.set_normal(nrm)
			st.set_uv(Vector2(v.x, v.z))
			st.set_vertex(v)
	var mi = MeshInstance3D.new()
	mi.name = "Glass"
	mi.mesh = st.commit()
	mi.material_override = _glass_mat
	mi.layers = 1
	_body_root.add_child(mi)


func _build_details(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var wing: float = shape["wing"]
	# side skirts + splitter + diffuser
	_add_box(Vector3(width * 0.98, 0.08, length * 0.62), Vector3(0, 0.30, 0), _trim_mat)
	_add_box(Vector3(width * 0.94, 0.07, 0.42), Vector3(0, 0.30, -length * 0.5 + 0.10), _trim_mat)
	_add_box(Vector3(width * 0.86, 0.16, 0.34), Vector3(0, 0.38, length * 0.5 - 0.14), _trim_mat)
	# front intake
	_add_box(Vector3(width * 0.46, 0.15, 0.10), Vector3(0, 0.50, -length * 0.5 + 0.02), _trim_mat)
	# mirrors
	for side in [-1.0, 1.0]:
		var m = _add_box(Vector3(0.22, 0.09, 0.12),
			Vector3(width * 0.5 * side * 1.02, height * 0.62 + 0.28, lerpf(-length * 0.5, length * 0.5, shape["cabin"][0]) + 0.18),
			_trim_mat)
		m.name = "Mirror%s" % ("L" if side < 0 else "R")
	# rear wing
	if wing > 0.02:
		var wing_y: float = height * 0.62 + 0.30 + height * 0.30 + wing * 0.55
		var wz: float = length * 0.5 - 0.22
		_add_box(Vector3(width * 0.86, 0.06, 0.42), Vector3(0, wing_y, wz), _body_mat)
		for side in [-1.0, 1.0]:
			_add_box(Vector3(0.06, wing * 0.42, 0.30),
				Vector3(width * 0.34 * side, wing_y - wing * 0.22, wz), _trim_mat)
	# accent stripe along the hood
	var stripe = _add_box(Vector3(width * 0.10, 0.012, length * 0.32),
		Vector3(0, height * 0.62 + 0.315, -length * 0.30), _accent_mat)
	stripe.name = "Stripe"


func _add_box(size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var bm = BoxMesh.new()
	bm.size = size
	var mi = MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	mi.layers = 1
	_body_root.add_child(mi)
	return mi


func _build_wheels(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var radius: float = shape["wheel"]
	var track: float = width * 0.5 - 0.06
	var axle_z = length * 0.5 - radius - 0.32
	var tyre_mat = StandardMaterial3D.new()
	tyre_mat.albedo_color = Color(0.035, 0.035, 0.04)
	tyre_mat.roughness = 0.92
	tyre_mat.metallic = 0.0
	var rim_mat = StandardMaterial3D.new()
	rim_mat.albedo_color = Color(0.72, 0.76, 0.84)
	rim_mat.metallic = 0.95
	rim_mat.roughness = 0.18
	if rim_style == 4:
		rim_mat.albedo_color = Color(0.10, 0.11, 0.13)
		rim_mat.roughness = 0.35
	var brake_mat = StandardMaterial3D.new()
	brake_mat.albedo_color = Color(0.55, 0.32, 0.10)
	brake_mat.emission_enabled = true
	brake_mat.emission = Color(1.0, 0.35, 0.05)
	brake_mat.emission_energy_multiplier = 0.0
	brake_mat.set_meta("brake", true)
	for front in [true, false]:
		for side in [-1.0, 1.0]:
			var z = -axle_z if front else axle_z
			var holder = Node3D.new()
			holder.name = "Wheel_%s_%s" % ["F" if front else "R", "L" if side < 0 else "R"]
			holder.position = Vector3(track * side, radius, z)
			add_child(holder)
			var spin = Node3D.new()
			spin.name = "Spin"
			holder.add_child(spin)
			var tyre = MeshInstance3D.new()
			var tm = CylinderMesh.new()
			tm.top_radius = radius
			tm.bottom_radius = radius
			tm.height = 0.31
			tm.radial_segments = 20
			tm.rings = 1
			tyre.mesh = tm
			tyre.material_override = tyre_mat
			tyre.rotation.x = PI * 0.5
			tyre.layers = 1
			spin.add_child(tyre)
			var hub = MeshInstance3D.new()
			var hm = CylinderMesh.new()
			hm.top_radius = radius * 0.62
			hm.bottom_radius = radius * 0.62
			hm.height = 0.33
			hm.radial_segments = 16
			hub.mesh = hm
			hub.material_override = rim_mat
			hub.rotation.x = PI * 0.5
			hub.layers = 1
			spin.add_child(hub)
			for s in range(rim_spokes):
				var spoke = MeshInstance3D.new()
				var sm = BoxMesh.new()
				sm.size = Vector3(0.325, radius * 0.66, 0.055)
				spoke.mesh = sm
				spoke.material_override = rim_mat
				spoke.rotation.x = float(s) / float(rim_spokes) * PI
				spoke.rotation.y = 0.0
				spoke.position = Vector3(0, 0, 0)
				spoke.rotation_order = EULER_ORDER_YXZ
				spoke.rotation.z = float(s) / float(rim_spokes) * PI
				spoke.layers = 1
				spin.add_child(spoke)
			var disc = MeshInstance3D.new()
			var dm = CylinderMesh.new()
			dm.top_radius = radius * 0.55
			dm.bottom_radius = radius * 0.55
			dm.height = 0.02
			dm.radial_segments = 14
			disc.mesh = dm
			disc.material_override = brake_mat
			disc.rotation.x = PI * 0.5
			disc.position = Vector3(0, 0, 0)
			spin.add_child(disc)
			wheels.append({
				"node": holder,
				"spin": spin,
				"front": front,
				"side": side,
				"radius": radius,
				"brake_mat": brake_mat,
			})


func _build_lights(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var y: float = height * 0.62 + 0.12
	for side in [-1.0, 1.0]:
		var h = _add_box(Vector3(width * 0.22, 0.10, 0.06),
			Vector3(width * 0.28 * side, y, -length * 0.5 + 0.03), _head_mat)
		h.name = "Headlight%s" % ("L" if side < 0 else "R")
		var t = _add_box(Vector3(width * 0.30, 0.075, 0.05),
			Vector3(width * 0.26 * side, y + 0.04, length * 0.5 - 0.02), _tail_mat)
		t.name = "Taillight%s" % ("L" if side < 0 else "R")
	var beam = SpotLight3D.new()
	beam.position = Vector3(0, height * 0.62 + 0.2, -length * 0.5 + 0.1)
	beam.spot_range = 46.0
	beam.spot_angle = 38.0
	beam.light_energy = 3.2
	beam.light_color = Color(0.78, 0.9, 1.0)
	beam.shadow_enabled = false
	beam.rotation_degrees = Vector3(-9, 180, 0)
	add_child(beam)


func _build_nitro(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var flame_mat = StandardMaterial3D.new()
	flame_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flame_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flame_mat.albedo_color = Color(0.45, 0.8, 1.0, 0.85)
	flame_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for side in [-1.0, 1.0]:
		var flame = MeshInstance3D.new()
		var cm = CylinderMesh.new()
		cm.top_radius = 0.11
		cm.bottom_radius = 0.0
		cm.height = 1.5
		cm.radial_segments = 10
		flame.mesh = cm
		flame.material_override = flame_mat
		flame.rotation.x = PI * 0.5
		flame.position = Vector3(width * 0.22 * side, 0.42, length * 0.5 + 0.7)
		flame.visible = false
		flame.modulate = Color(1, 1, 1, 1)
		add_child(flame)
		_nitro_nodes.append(flame)


func set_paint_live(color: Color) -> void:
	paint = color
	if _body_mat:
		_body_mat.albedo_color = color
		_accent_mat.albedo_color = color.lightened(0.35)
		_accent_mat.emission = color


func set_brake(on: bool) -> void:
	if _brake_light == on:
		return
	_brake_light = on
	for w in wheels:
		var mat: StandardMaterial3D = w["brake_mat"]
		mat.emission_energy_multiplier = 3.4 if on else 0.0
	if _tail_mat:
		_tail_mat.emission_energy_multiplier = 5.0 if on else 2.2


func set_nitro(on: bool, amount: float = 1.0) -> void:
	for n in _nitro_nodes:
		n.visible = on
		if on:
			var flicker = 0.85 + 0.3 * sin(float(Time.get_ticks_msec()) * 0.045)
			var len_scale = (0.7 + 0.9 * amount) * flicker
			n.scale = Vector3(0.85 + 0.25 * flicker, 1.0, len_scale)


func set_damage(amount: float) -> void:
	_damage = clampf(amount, 0.0, 1.0)
	if _body_mat:
		_body_mat.albedo_color = paint.darkened(_damage * 0.35).lerp(Color(0.18, 0.16, 0.14), _damage * 0.35)
	if _body_root:
		_body_root.rotation.z = sin(_damage * 40.0) * 0.02 * _damage


func steer_wheels(angle_rad: float, spin_amount: float) -> void:
	for w in wheels:
		if w["front"]:
			var holder: Node3D = w["node"]
			holder.rotation.y = angle_rad
		var spin: Node3D = w["spin"]
		spin.rotation.x += spin_amount
