extends Node3D
## Builds the drivable world for one track: road surface + collision, kerbs,
## neon edges, barriers, terrain, environment scenery (city / desert / mountain
## / coast), start gantry and checkpoints.

const TrackLib = preload("res://scripts/race/TrackLibrary.gd")
const NEON_SHADER := """
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;
uniform vec4 color : source_color = vec4(0.13, 0.91, 1.0, 1.0);
uniform float energy = 3.0;
uniform float pulse_speed = 1.4;
void fragment() {
    float wave = 0.78 + 0.22 * sin(TIME * pulse_speed + VERTEX.z * 0.05 + VERTEX.x * 0.02);
    ALBEDO = color.rgb * energy * wave;
}
"""

const ROAD_RINGS := 420

var data: TrackLib.TrackData = null
var track: Dictionary = {}
var env: String = "city"
var time_of_day: String = "night"
var weather: String = "dry"
var accent: Color = Color("22e9ff")
var second_accent: Color = Color("ff2e93")
var start_transform: Transform3D = Transform3D.IDENTITY
var checkpoints: Array = []
var scenery_root: Node3D
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _neon_mat: ShaderMaterial
var _road_mat: StandardMaterial3D


func build(track_dict: Dictionary) -> void:
	track = track_dict
	env = str(track.get("env", "city"))
	time_of_day = str(track.get("time", "night"))
	weather = str(track.get("weather", "dry"))
	_rng.seed = int(track.get("gen", {}).get("seed", 7))
	data = TrackLib.for_track(track)
	start_transform = data.start_transform
	if env == "city":
		accent = Color("22e9ff")
		second_accent = Color("ff2e93")
	elif env == "desert":
		accent = Color("ffb020")
		second_accent = Color("ff6a3d")
	elif env == "mountain":
		accent = Color("7fe3ff")
		second_accent = Color("cfd6e6")
	else:
		accent = Color("ff8a5c")
		second_accent = Color("ffd166")
	_build_materials()
	_build_road()
	_build_barriers()
	_build_ground()
	scenery_root = Node3D.new()
	scenery_root.name = "Scenery"
	add_child(scenery_root)
	if env == "city":
		_build_city()
	elif env == "desert":
		_build_desert()
	elif env == "mountain":
		_build_mountain()
	else:
		_build_coast()
	_build_start_gantry()
	_build_checkpoints()


func _build_materials() -> void:
	_road_mat = StandardMaterial3D.new()
	_road_mat.albedo_color = Color(0.30, 0.31, 0.36)
	if ResourceLoader.exists("res://assets/textures/asphalt_albedo.png"):
		_road_mat.albedo_texture = load("res://assets/textures/asphalt_albedo.png")
		_road_mat.uv1_scale = Vector3(1.0, 18.0, 1.0)
	_road_mat.roughness = 0.55 if weather != "rain" else 0.20
	_road_mat.metallic = 0.0 if weather != "rain" else 0.35
	_neon_mat = ShaderMaterial.new()
	var sh = Shader.new()
	sh.code = NEON_SHADER
	_neon_mat.shader = sh
	_neon_mat.set_shader_parameter("color", accent)
	_neon_mat.set_shader_parameter("energy", 2.6)


func _build_road() -> void:
	var body = StaticBody3D.new()
	body.name = "RoadCollision"
	body.collision_layer = 1
	add_child(body)
	var step = maxi(2, int(float(data.segments) / float(ROAD_RINGS)))
	var ring_count = int(ceil(float(data.segments) / float(step)))
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for r in range(ring_count):
		var i0 = mini(data.segments - 1, r * step)
		var i1 = mini(data.segments, (r + 1) * step)
		if i1 <= i0:
			continue
		var p0: Vector3 = data.points[i0]
		var p1: Vector3 = data.points[i1]
		var rt0: Vector3 = data.rights[i0]
		var rt1: Vector3 = data.rights[i1]
		var w0: float = data.widths[i0] * 0.5
		var w1: float = data.widths[i1] * 0.5
		var a = p0 - rt0 * w0
		var b = p0 + rt0 * w0
		var c = p1 - rt1 * w1
		var d = p1 + rt1 * w1
		for vtx in [a, c, b, b, c, d]:
			st.set_normal(Vector3.UP)
			st.set_uv(Vector2(vtx.dot(rt0) * 0.25, vtx.dot(data.tangents[i0]) * 0.25))
			st.set_vertex(vtx + Vector3.UP * 0.02)
		# collider per ring
		var mid = (p0 + p1) * 0.5
		var fwd = p1 - p0
		if fwd.length() > 0.01:
			var cs = CollisionShape3D.new()
			var box = BoxShape3D.new()
			box.size = Vector3(data.widths[i0] * 1.7, 1.2, fwd.length() + 1.6)
			cs.shape = box
			cs.position = mid + Vector3.DOWN * 0.6
			cs.transform.basis = Basis.looking_at(fwd.normalized(), Vector3.UP)
			body.add_child(cs)
	st.generate_tangents()
	var mi = MeshInstance3D.new()
	mi.name = "RoadSurface"
	mi.mesh = st.commit()
	mi.material_override = _road_mat
	mi.layers = 1
	add_child(mi)
	# kerbs + neon edge strips
	var kst = SurfaceTool.new()
	kst.begin(Mesh.PRIMITIVE_TRIANGLES)
	var nst = SurfaceTool.new()
	nst.begin(Mesh.PRIMITIVE_TRIANGLES)
	for side in [-1.0, 1.0]:
		for r in range(ring_count):
			var i0 = mini(data.segments - 1, r * step)
			var i1 = mini(data.segments, (r + 1) * step)
			if i1 <= i0:
				continue
			var e0: Vector3 = data.points[i0] + data.rights[i0] * data.widths[i0] * 0.5 * side
			var e1: Vector3 = data.points[i1] + data.rights[i1] * data.widths[i1] * 0.5 * side
			var x0: Vector3 = e0 + data.rights[i0] * 0.9 * side
			var x1: Vector3 = e1 + data.rights[i1] * 0.9 * side
			var kc = Color(0.85, 0.87, 0.92) if int(r / 4.0) % 2 == 0 else Color(0.66, 0.08, 0.10)
			for vtx in [e0, e1, x0, x0, e1, x1]:
				kst.set_color(kc)
				kst.set_normal(Vector3.UP)
				kst.set_vertex(vtx + Vector3.UP * 0.07)
			var a0: Vector3 = e0 + data.rights[i0] * 0.14 * side
			var a1: Vector3 = e1 + data.rights[i1] * 0.14 * side
			var b0: Vector3 = a0 + data.rights[i0] * 0.24 * side
			var b1: Vector3 = a1 + data.rights[i1] * 0.24 * side
			for vtx in [a0 + Vector3.UP * 0.11, a1 + Vector3.UP * 0.11, b0 + Vector3.UP * 0.11,
					b0 + Vector3.UP * 0.11, a1 + Vector3.UP * 0.11, b1 + Vector3.UP * 0.11]:
				nst.set_normal(Vector3.UP)
				nst.set_vertex(vtx)
	var kmi = MeshInstance3D.new()
	var kmat = StandardMaterial3D.new()
	kmat.vertex_color_use_as_albedo = true
	kmat.roughness = 0.7
	kmi.mesh = kst.commit()
	kmi.material_override = kmat
	kmi.layers = 1
	add_child(kmi)
	var nmi = MeshInstance3D.new()
	nmi.mesh = nst.commit()
	nmi.material_override = _neon_mat
	nmi.layers = 1
	add_child(nmi)


func _build_barriers() -> void:
	var body = StaticBody3D.new()
	body.name = "Barriers"
	body.collision_layer = 1
	add_child(body)
	var bst = SurfaceTool.new()
	bst.begin(Mesh.PRIMITIVE_TRIANGLES)
	var nst = SurfaceTool.new()
	nst.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step = 8
	for side in [-1.0, 1.0]:
		var i = 0
		while i < data.segments:
			var j = mini(data.segments, i + step)
			var p0: Vector3 = data.points[i] + data.rights[i] * (data.widths[i] * 0.5 + 1.6) * side
			var p1: Vector3 = data.points[j] + data.rights[j] * (data.widths[j] * 0.5 + 1.6) * side
			var a = p0
			var b = p0 + Vector3.UP * 0.85
			var c = p1
			var d = p1 + Vector3.UP * 0.85
			for vtx in [a, c, b, b, c, d]:
				bst.set_normal(-data.rights[i] * side)
				bst.set_vertex(vtx)
			var na = p0 + Vector3.UP * 0.9
			var nb = p1 + Vector3.UP * 0.9
			var off: Vector3 = data.rights[i] * 0.12
			for vtx in [na - off, nb - off, na + off, na + off, nb - off, nb + off]:
				nst.set_normal(Vector3.UP)
				nst.set_vertex(vtx)
			var fwd = p1 - p0
			if fwd.length() > 0.01:
				var cs = CollisionShape3D.new()
				var box = BoxShape3D.new()
				box.size = Vector3(0.6, 1.6, fwd.length() + 1.0)
				cs.shape = box
				cs.position = (p0 + p1) * 0.5 + Vector3.UP * 0.6
				cs.transform.basis = Basis.looking_at(fwd.normalized(), Vector3.UP)
				body.add_child(cs)
			i += step
	var mi = MeshInstance3D.new()
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.10, 0.12, 0.18)
	mat.metallic = 0.6
	mat.roughness = 0.4
	mi.mesh = bst.commit()
	mi.material_override = mat
	mi.layers = 1
	add_child(mi)
	var nmat = ShaderMaterial.new()
	nmat.shader = _neon_mat.shader
	nmat.set_shader_parameter("color", second_accent)
	nmat.set_shader_parameter("energy", 2.2)
	var nmi = MeshInstance3D.new()
	nmi.mesh = nst.commit()
	nmi.material_override = nmat
	nmi.layers = 1
	add_child(nmi)


func _build_ground() -> void:
	var plane = PlaneMesh.new()
	plane.size = Vector2(4200, 4200)
	plane.subdivide_width = 8
	plane.subdivide_depth = 8
	var mi = MeshInstance3D.new()
	mi.name = "Ground"
	mi.mesh = plane
	var mat = StandardMaterial3D.new()
	if env == "city":
		mat.albedo_color = Color(0.045, 0.05, 0.07)
	elif env == "desert":
		mat.albedo_color = Color(0.55, 0.38, 0.22)
	elif env == "mountain":
		mat.albedo_color = Color(0.20, 0.26, 0.22)
	else:
		mat.albedo_color = Color(0.10, 0.22, 0.26)
	mat.roughness = 0.95
	if ResourceLoader.exists("res://assets/textures/concrete_albedo.png"):
		mat.albedo_texture = load("res://assets/textures/concrete_albedo.png")
		mat.uv1_scale = Vector3(140, 140, 1)
	mi.material_override = mat
	mi.position = Vector3(0, data.min_y - 0.4, 0)
	mi.layers = 1
	add_child(mi)


func _nearest_road_distance(p: Vector3) -> float:
	return float(data.project(p)["distance"])


func _build_city() -> void:
	var glass = StandardMaterial3D.new()
	glass.albedo_color = Color(0.06, 0.09, 0.16)
	glass.metallic = 0.8
	glass.roughness = 0.12
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var box = BoxMesh.new()
	mm.mesh = box
	mm.instance_count = 620
	var used = 0
	var radius: float = data.total_length / TAU
	for i in range(620):
		var ang = _rng.randf() * TAU
		var dist = radius + _rng.randf_range(40.0, 430.0)
		var pos = Vector3(cos(ang) * dist, 0, sin(ang) * dist)
		if _nearest_road_distance(pos) < 30.0:
			continue
		var h = _rng.randf_range(18.0, 120.0) * (1.0 - clampf(dist / 430.0, 0.0, 0.6))
		var w = _rng.randf_range(10.0, 26.0)
		var d = _rng.randf_range(10.0, 26.0)
		mm.set_instance_transform(used, Transform3D(Basis().scaled(Vector3(w, h, d)),
			Vector3(pos.x, h * 0.5 - 0.6, pos.z)))
		used += 1
	mm.instance_count = used
	var mmi = MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = glass
	mmi.layers = 1
	scenery_root.add_child(mmi)
	# emissive window strips
	var em = MultiMesh.new()
	em.transform_format = MultiMesh.TRANSFORM_3D
	var strip = BoxMesh.new()
	strip.size = Vector3(1, 0.22, 1)
	em.mesh = strip
	em.instance_count = 1600
	var eused = 0
	var ecol = StandardMaterial3D.new()
	ecol.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ecol.vertex_color_use_as_albedo = true
	for i in range(1600):
		var ang = _rng.randf() * TAU
		var dist = radius + _rng.randf_range(38.0, 390.0)
		var pos = Vector3(cos(ang) * dist, _rng.randf_range(5.0, 70.0), sin(ang) * dist)
		if _nearest_road_distance(pos) < 28.0:
			continue
		em.set_instance_transform(eused, Transform3D(
			Basis().scaled(Vector3(_rng.randf_range(8.0, 22.0), 1.0, 0.35)), pos))
		em.set_instance_color(eused, accent if _rng.randf() < 0.6 else second_accent)
		eused += 1
	em.instance_count = eused
	var emi = MultiMeshInstance3D.new()
	emi.multimesh = em
	emi.material_override = ecol
	emi.layers = 1
	scenery_root.add_child(emi)
	# street lamps
	var lmm = MultiMesh.new()
	lmm.transform_format = MultiMesh.TRANSFORM_3D
	var pole = CylinderMesh.new()
	pole.top_radius = 0.12
	pole.bottom_radius = 0.16
	pole.height = 7.0
	lmm.mesh = pole
	var lcount = 90
	lmm.instance_count = lcount
	for i in range(lcount):
		var idx = int(float(i) / float(lcount) * float(data.segments))
		var side = -1.0 if i % 2 == 0 else 1.0
		var p: Vector3 = data.points[idx] + data.rights[idx] * (data.widths[idx] * 0.5 + 2.6) * side
		lmm.set_instance_transform(i, Transform3D(Basis(), p + Vector3.UP * 3.5))
		if i % 4 == 0:
			var lamp = OmniLight3D.new()
			lamp.light_color = accent if i % 2 == 0 else second_accent
			lamp.light_energy = 1.4
			lamp.omni_range = 16.0
			lamp.position = p + Vector3.UP * 7.0
			lamp.shadow_enabled = false
			scenery_root.add_child(lamp)
	var lmi = MultiMeshInstance3D.new()
	lmi.multimesh = lmm
	var lmat = StandardMaterial3D.new()
	lmat.albedo_color = Color(0.16, 0.18, 0.22)
	lmat.metallic = 0.7
	lmat.roughness = 0.35
	lmi.material_override = lmat
	lmi.layers = 1
	scenery_root.add_child(lmi)


func _build_desert() -> void:
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var rock = CylinderMesh.new()
	rock.top_radius = 0.35
	rock.bottom_radius = 1.0
	rock.height = 1.0
	rock.radial_segments = 7
	mm.mesh = rock
	mm.instance_count = 360
	var used = 0
	var radius: float = data.total_length / TAU
	for i in range(360):
		var ang = _rng.randf() * TAU
		var dist = radius + _rng.randf_range(32.0, 520.0)
		var pos = Vector3(cos(ang) * dist, 0, sin(ang) * dist)
		if _nearest_road_distance(pos) < 26.0:
			continue
		var h = _rng.randf_range(6.0, 46.0)
		var w = _rng.randf_range(4.0, 16.0)
		mm.set_instance_transform(used, Transform3D(
			Basis().scaled(Vector3(w, h, w)).rotated(Vector3.UP, _rng.randf() * TAU),
			Vector3(pos.x, h * 0.5 - 0.6, pos.z)))
		used += 1
	mm.instance_count = used
	var mmi = MultiMeshInstance3D.new()
	mmi.multimesh = mm
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.62, 0.40, 0.24)
	mat.roughness = 0.9
	mmi.material_override = mat
	mmi.layers = 1
	scenery_root.add_child(mmi)
	var smm = MultiMesh.new()
	smm.transform_format = MultiMesh.TRANSFORM_3D
	var shrub = SphereMesh.new()
	shrub.radius = 0.7
	shrub.height = 1.0
	shrub.radial_segments = 6
	shrub.rings = 3
	smm.mesh = shrub
	smm.instance_count = 500
	for i in range(500):
		var idx = _rng.randi_range(0, data.segments - 1)
		var side = -1.0 if _rng.randf() < 0.5 else 1.0
		var p: Vector3 = data.points[idx] + data.rights[idx] * (data.widths[idx] * 0.5 + _rng.randf_range(3.0, 24.0)) * side
		var sc = _rng.randf_range(0.5, 1.5)
		smm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(sc, sc * 0.6, sc)), p))
	var smi = MultiMeshInstance3D.new()
	smi.multimesh = smm
	var smat = StandardMaterial3D.new()
	smat.albedo_color = Color(0.30, 0.34, 0.16)
	smat.roughness = 1.0
	smi.material_override = smat
	smi.layers = 1
	scenery_root.add_child(smi)


func _build_mountain() -> void:
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var pine = CylinderMesh.new()
	pine.top_radius = 0.0
	pine.bottom_radius = 1.0
	pine.height = 1.0
	pine.radial_segments = 5
	mm.mesh = pine
	mm.instance_count = 700
	for i in range(700):
		var idx = _rng.randi_range(0, data.segments - 1)
		var side = -1.0 if _rng.randf() < 0.5 else 1.0
		var p: Vector3 = data.points[idx] + data.rights[idx] * (data.widths[idx] * 0.5 + _rng.randf_range(4.0, 90.0)) * side
		var h = _rng.randf_range(9.0, 26.0)
		var w = h * _rng.randf_range(0.18, 0.30)
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(w, h, w)),
			p + Vector3.UP * h * 0.5))
	mm.instance_count = 700
	var mmi = MultiMeshInstance3D.new()
	mmi.multimesh = mm
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.10, 0.22, 0.18) if time_of_day != "night" else Color(0.05, 0.11, 0.10)
	mat.roughness = 0.95
	mmi.material_override = mat
	mmi.layers = 1
	scenery_root.add_child(mmi)
	var peaks = MultiMesh.new()
	peaks.transform_format = MultiMesh.TRANSFORM_3D
	var cone = CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 1.0
	cone.height = 1.0
	cone.radial_segments = 4
	peaks.mesh = cone
	peaks.instance_count = 40
	var radius: float = data.total_length / TAU
	for i in range(40):
		var ang = _rng.randf() * TAU
		var dist = radius + _rng.randf_range(300.0, 900.0)
		var h = _rng.randf_range(220.0, 560.0)
		var w = h * _rng.randf_range(0.5, 0.9)
		peaks.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(w, h, w)),
			Vector3(cos(ang) * dist, h * 0.5 - 20.0, sin(ang) * dist)))
	var pmi = MultiMeshInstance3D.new()
	pmi.multimesh = peaks
	var pmat = StandardMaterial3D.new()
	pmat.albedo_color = Color(0.55, 0.62, 0.72) if time_of_day != "night" else Color(0.18, 0.22, 0.30)
	pmat.roughness = 0.9
	pmi.material_override = pmat
	pmi.layers = 1
	scenery_root.add_child(pmi)


func _build_coast() -> void:
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var palm = CylinderMesh.new()
	palm.top_radius = 0.15
	palm.bottom_radius = 0.30
	palm.height = 1.0
	palm.radial_segments = 6
	mm.mesh = palm
	mm.instance_count = 260
	for i in range(260):
		var idx = _rng.randi_range(0, data.segments - 1)
		var p: Vector3 = data.points[idx] - data.rights[idx] * (data.widths[idx] * 0.5 + _rng.randf_range(4.0, 40.0))
		var h = _rng.randf_range(8.0, 16.0)
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(0.6, h, 0.6)),
			p + Vector3.UP * h * 0.5))
	var mmi = MultiMeshInstance3D.new()
	mmi.multimesh = mm
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.32, 0.24, 0.16)
	mat.roughness = 0.9
	mmi.material_override = mat
	mmi.layers = 1
	scenery_root.add_child(mmi)
	var sea = PlaneMesh.new()
	sea.size = Vector2(3000, 3000)
	sea.subdivide_width = 8
	sea.subdivide_depth = 8
	var smi = MeshInstance3D.new()
	smi.mesh = sea
	var smat = StandardMaterial3D.new()
	smat.albedo_color = Color(0.05, 0.18, 0.28)
	smat.metallic = 0.6
	smat.roughness = 0.08
	smat.emission_enabled = true
	smat.emission = Color(0.05, 0.12, 0.2)
	smat.emission_energy_multiplier = 0.4
	smi.material_override = smat
	smi.position = Vector3(0, data.min_y - 2.5, -data.total_length / TAU * 2.0)
	smi.layers = 1
	scenery_root.add_child(smi)


func _build_start_gantry() -> void:
	var gantry = Node3D.new()
	gantry.name = "StartGantry"
	var p: Vector3 = data.points[0]
	var right: Vector3 = data.rights[0]
	var w: float = data.widths[0] * 0.5
	var metal = StandardMaterial3D.new()
	metal.albedo_color = Color(0.08, 0.09, 0.13)
	metal.metallic = 0.8
	metal.roughness = 0.3
	for side in [-1.0, 1.0]:
		var pillar = MeshInstance3D.new()
		var box = BoxMesh.new()
		box.size = Vector3(0.8, 7.0, 0.8)
		pillar.mesh = box
		pillar.material_override = metal
		pillar.position = p + right * (w + 1.8) * side + Vector3.UP * 3.5
		gantry.add_child(pillar)
	var beam = MeshInstance3D.new()
	var bbox = BoxMesh.new()
	bbox.size = Vector3(w * 2.0 + 3.6, 1.4, 0.9)
	beam.mesh = bbox
	beam.material_override = metal
	beam.position = p + Vector3.UP * 7.0
	beam.transform.basis = Basis.looking_at(data.tangents[0], Vector3.UP)
	gantry.add_child(beam)
	var sign = MeshInstance3D.new()
	var sbox = BoxMesh.new()
	sbox.size = Vector3(w * 1.4, 0.9, 0.12)
	sign.mesh = sbox
	var smat = ShaderMaterial.new()
	smat.shader = _neon_mat.shader
	smat.set_shader_parameter("color", accent)
	smat.set_shader_parameter("energy", 2.0)
	sign.material_override = smat
	sign.position = p + Vector3.UP * 7.0
	sign.transform.basis = Basis.looking_at(data.tangents[0], Vector3.UP)
	gantry.add_child(sign)
	add_child(gantry)


func _build_checkpoints() -> void:
	checkpoints.clear()
	var n = 8
	for i in range(n):
		var idx = int(float(i) / float(n) * float(data.segments))
		checkpoints.append({"index": idx, "along": data.cumulative[idx], "pos": data.points[idx]})
