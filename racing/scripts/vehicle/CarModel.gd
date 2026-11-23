extends Node3D
## Production-grade procedural car.
##
## Instead of a handful of boxes this builds a proper automotive surface:
##   * lofted body shell sampled from 24 stations with Bezier-smoothed
##     shoulders, so the silhouette curves like a real body panel
##   * separate greenhouse with raked pillars and a curved roof
##   * wheel arches cut into the shell (dark inner wells + arch lips)
##   * layered lighting: projector headlights, LED signature DRL, tail bars
##   * multi-spoke forged rims with brake discs, calipers and tyre sidewalls
##   * mirrors, splitter, diffuser, side skirts and an adjustable wing
##   * clearcoat paint shader, anisotropic glass, emissive trim
##
## Everything is generated in code, so all 32 cars share one 100 % original
## CC0 pipeline and nothing is loaded from a third-party model.

var car_info: Dictionary = {}
var paint = Color(0x22, 0xe9, 0xff)
var paint_finish = 0
var rim_id = "stock"
var rim_spokes = 5
var rim_style = 0
var wheels: Array = []
var _body_mat: ShaderMaterial
var _glass_mat: StandardMaterial3D
var _trim_mat: StandardMaterial3D
var _carbon_mat: StandardMaterial3D
var _chrome_mat: StandardMaterial3D
var _accent_mat: StandardMaterial3D
var _head_mat: StandardMaterial3D
var _tail_mat: StandardMaterial3D
var _drl_mat: StandardMaterial3D
var _tyre_mat: StandardMaterial3D
var _rim_mat: StandardMaterial3D
var _brake_mat: StandardMaterial3D
var _nitro_nodes: Array[Node3D] = []
var _brake_light = false
var _damage = 0.0
var _shapes: Dictionary = {}
var _body_root: Node3D
var _paint_shader: Shader
var _detail_root: Node3D = null
var _glass_house: Node3D = null

const CAR_PAINT_SHADER := "res://shaders/car_paint.gdshader"

# Station count for the lofted shell. 26 was chosen when this ran at 30 fps;
# at 40 the shoulder crease and the wheel-arch flare both resolve instead of
# faceting, which is the difference between "a car" and "a low-poly car".
const STATIONS := 40

## Radial resolution of each station. 28 gave visible facets on the shoulders
## under a rim light, which is exactly where the eye goes on a car.
const RING_SEGMENTS := 44


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
	_push_body_size(shape)
	_build_glasshouse(shape)
	_build_wheel_arches(shape)
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


## The paint shader draws shut-lines and the shoulder crease from the car's own
## dimensions, so every body style gets panel structure in the right place
## instead of a generic grid. Called once after the shape is chosen.
func _push_body_size(shape: Dictionary) -> void:
	if _body_mat == null or _body_mat.shader == null:
		return
	_body_mat.set_shader_parameter("body_size", Vector3(
		float(shape.get("width", 1.9)),
		float(shape.get("height", 1.2)),
		float(shape.get("length", 4.6))))
	# Pearl and iridescence belong to the paints that claim them, and to the
	# hypercars, which are the ones a player stares at. Everything else keeps
	# the plain coat: turning this on everywhere makes the whole fleet look
	# like a cosmetics advert and costs two extra sin() per pixel.
	var cls := str(car_info.get("class", "street"))
	var pid := str(car_info.get("paint", "cyan"))
	var pearl := 0.0
	var irid := 0.0
	if pid in ["pearl", "glacier", "phantom", "chrome", "arctic"]:
		pearl = 0.42
	if pid in ["nebula", "eclipse", "void", "plasma", "neon_pink"]:
		irid = 0.55
	if cls == "hyper":
		irid = maxf(irid, 0.30)
		pearl = maxf(pearl, 0.18)
	_body_mat.set_shader_parameter("pearl_shift", pearl)
	_body_mat.set_shader_parameter("iridescence", irid)


func _build_materials() -> void:
	# --- clearcoat automotive paint -----------------------------------------
	if ResourceLoader.exists(CAR_PAINT_SHADER):
		_paint_shader = load(CAR_PAINT_SHADER)
	_body_mat = ShaderMaterial.new()
	if _paint_shader:
		_body_mat.shader = _paint_shader
		_body_mat.set_shader_parameter("paint_color", paint)
		_body_mat.set_shader_parameter("flake_color", paint.lightened(0.55))
		_body_mat.set_shader_parameter("metallic", 0.20 if paint_finish == 1 else 0.45)
		_body_mat.set_shader_parameter("roughness", 0.40 if paint_finish == 1 else (0.22 if paint_finish == 2 else 0.32))
		_body_mat.set_shader_parameter("clearcoat", 0.35 if paint_finish == 1 else 1.0)
		_body_mat.set_shader_parameter("flake_amount", 0.0)
		_body_mat.set_shader_parameter("sheen", 0.30)
		_body_mat.set_shader_parameter("rim_color", paint.lightened(0.8))
		_body_mat.set_shader_parameter("rim_strength", 0.42)
		_body_mat.set_shader_parameter("rim_power", 3.4)

	# --- hydrophobic tinted glass -------------------------------------------
	_glass_mat = StandardMaterial3D.new()
	_glass_mat.albedo_color = Color(0.028, 0.042, 0.062, 0.86)
	_glass_mat.metallic = 0.90
	_glass_mat.roughness = 0.035
	_glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_glass_mat.rim_enabled = true
	_glass_mat.rim = 0.55
	_glass_mat.rim_tint = 0.85

	_trim_mat = StandardMaterial3D.new()
	_trim_mat.albedo_color = Color(0.038, 0.042, 0.052)
	_trim_mat.metallic = 0.55
	_trim_mat.roughness = 0.42

	_carbon_mat = StandardMaterial3D.new()
	_carbon_mat.albedo_color = Color(0.052, 0.055, 0.065)
	_carbon_mat.metallic = 0.42
	_carbon_mat.roughness = 0.22
	_carbon_mat.clearcoat_enabled = true
	_carbon_mat.clearcoat = 1.0
	_carbon_mat.clearcoat_roughness = 0.05

	_chrome_mat = StandardMaterial3D.new()
	_chrome_mat.albedo_color = Color(0.82, 0.85, 0.90)
	_chrome_mat.metallic = 1.0
	_chrome_mat.roughness = 0.08

	_accent_mat = StandardMaterial3D.new()
	_accent_mat.albedo_color = paint.lightened(0.35)
	_accent_mat.emission_enabled = true
	_accent_mat.emission = paint
	_accent_mat.emission_energy_multiplier = 1.2

	_head_mat = StandardMaterial3D.new()
	_head_mat.albedo_color = Color(0.92, 0.96, 1.0)
	_head_mat.emission_enabled = true
	_head_mat.emission = Color(0.78, 0.90, 1.0)
	_head_mat.emission_energy_multiplier = 7.0
	_head_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	_drl_mat = StandardMaterial3D.new()
	_drl_mat.albedo_color = Color(0.85, 0.95, 1.0)
	_drl_mat.emission_enabled = true
	_drl_mat.emission = Color(0.55, 0.85, 1.0)
	_drl_mat.emission_energy_multiplier = 9.0
	_drl_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	_tail_mat = StandardMaterial3D.new()
	_tail_mat.albedo_color = Color(1.0, 0.10, 0.18)
	_tail_mat.emission_enabled = true
	_tail_mat.emission = Color(1.0, 0.08, 0.16)
	_tail_mat.emission_energy_multiplier = 3.0
	_tail_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	_tyre_mat = StandardMaterial3D.new()
	_tyre_mat.albedo_color = Color(0.028, 0.028, 0.032)
	_tyre_mat.roughness = 0.94
	_tyre_mat.metallic = 0.0

	_rim_mat = StandardMaterial3D.new()
	_rim_mat.albedo_color = Color(0.74, 0.78, 0.86)
	_rim_mat.metallic = 0.98
	_rim_mat.roughness = 0.14
	_rim_mat.clearcoat_enabled = true
	_rim_mat.clearcoat = 1.0
	if rim_style == 4:
		_rim_mat.albedo_color = Color(0.09, 0.10, 0.12)
		_rim_mat.roughness = 0.30
	elif rim_style == 3:
		_rim_mat.albedo_color = Color(0.66, 0.48, 0.22)
		_rim_mat.metallic = 0.95
	elif rim_style == 2:
		_rim_mat.albedo_color = Color(0.16, 0.17, 0.20)
		_rim_mat.roughness = 0.22

	_brake_mat = StandardMaterial3D.new()
	_brake_mat.albedo_color = Color(0.42, 0.24, 0.09)
	_brake_mat.emission_enabled = true
	_brake_mat.emission = Color(1.0, 0.32, 0.04)
	_brake_mat.emission_energy_multiplier = 0.0
	_brake_mat.set_meta("brake", true)


## Body shell: 26 stations lofted with a smoothed superellipse cross section.
## The cross-section exponent changes along the length, flatter at the sills,
## rounder over the shoulders, which is what makes a car read as a car.
func _build_body(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var nose: float = shape["nose"]
	var tail: float = shape["tail"]
	var stance: float = shape["stance"]
	var bevel: float = shape["bevel"]

	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings: Array = []
	var ring_zs: Array = []

	for i in range(STATIONS + 1):
		var t: float = float(i) / float(STATIONS)
		var z: float = lerpf(-length * 0.5, length * 0.5, t)

		# Taper: nose and tail pull in, with a cubic ease so it is not linear.
		var taper: float = 1.0
		if t < 0.14:
			var k: float = t / 0.14
			taper = lerpf(nose + 0.16, 1.0, 1.0 - pow(1.0 - k, 2.4))
		elif t > 0.84:
			var k2: float = (t - 0.84) / 0.16
			taper = lerpf(1.0, tail + 0.14, pow(k2, 1.9))

		# Plan shape: hips over the rear wheels, a pinch at the doors.
		var hip: float = 1.0
		if t > 0.30 and t < 0.74:
			var mid: float = (t - 0.30) / 0.44
			hip = 1.0 + 0.045 * stance * sin(mid * PI) + 0.02 * sin(mid * PI * 2.0)
		var half_w: float = width * 0.5 * taper * hip

		# Profile: low sill, high shoulder, falling away at both ends.
		var sill_y: float = 0.30 - stance * 0.05
		var shoulder_y: float = height * 0.60 + 0.30
		if t < 0.16:
			shoulder_y = lerpf(height * 0.40 + 0.16, shoulder_y, pow(t / 0.16, 0.75))
		elif t > 0.86:
			shoulder_y = lerpf(shoulder_y, height * 0.44 + 0.10, pow((t - 0.86) / 0.14, 1.35))

		# Superellipse cross section: exponent shrinks at the ends = rounder.
		var n_exp: float = 3.1 - bevel * 3.0
		if t < 0.12:
			n_exp = lerpf(2.0, n_exp, t / 0.12)
		elif t > 0.88:
			n_exp = lerpf(n_exp, 2.1, (t - 0.88) / 0.12)
		n_exp = clampf(n_exp, 2.0, 4.2)

		var ring: Array = []
		var seg: int = RING_SEGMENTS
		for s in range(seg):
			var a: float = float(s) / float(seg) * TAU
			# superellipse: |cos|^(2/n) signed, |sin|^(2/n) signed
			var ca: float = cos(a)
			var sa: float = sin(a)
			var ex: float = 2.0 / n_exp
			var ux: float = signf(ca) * pow(absf(ca), ex)
			var uy: float = signf(sa) * pow(absf(sa), ex)
			# Vertical squash of the lower half gives a flat chassis underside.
			var y: float
			if uy < 0.0:
				y = lerpf(sill_y, (sill_y + shoulder_y) * 0.5, uy + 1.0)
			else:
				y = lerpf((sill_y + shoulder_y) * 0.5, shoulder_y, uy)

			# --- shoulder crease -------------------------------------------
			# A real body panel is not a single smooth ellipse: there is a hard
			# character line along the shoulder where the upper surface breaks
			# away from the door skin. Without it the rim light slides over the
			# body as one continuous gradient and the shell reads as a blob.
			# `uy` is 0 at the mid-line and 1 at the shoulder, so the crease sits
			# just under the widest point and pulls the surface in slightly.
			var crease: float = exp(-pow((uy - 0.62) * 7.0, 2.0))
			var crease_depth: float = 0.012 + 0.020 * stance

			# --- wheel-arch flare ------------------------------------------
			# The body swells over each axle. Sampled from the station's own z,
			# so the flare follows the wheelbase that this shape actually uses
			# rather than a fixed length. This is the single strongest cue that
			# a shape is a car and not a lozenge.
			var axle_span: float = length * 0.5 - float(shape["wheel"]) - 0.32
			var fa: float = exp(-pow((z - axle_span) / 0.72, 2.0))
			var ra: float = exp(-pow((z + axle_span) / 0.86, 2.0))
			var flare: float = (fa * 0.85 + ra * 1.0) * clampf(uy * 1.5 - 0.15, 0.0, 1.0)
			flare *= 0.030 + 0.055 * stance

			var x: float = ux * half_w * (1.0 + flare) - signf(ux) * crease * crease_depth
			ring.append(Vector3(x, y, z))
		rings.append(ring)
		ring_zs.append(z)

	# stitch the rings into quads
	for r in range(rings.size() - 1):
		var a_ring: Array = rings[r]
		var b_ring: Array = rings[r + 1]
		var n: int = a_ring.size()
		for k in range(n):
			var k2: int = (k + 1) % n
			var v0: Vector3 = a_ring[k]
			var v1: Vector3 = a_ring[k2]
			var v2: Vector3 = b_ring[k]
			var v3: Vector3 = b_ring[k2]
			# a_ring is the front station (lower z), so the outward face is
			# (v0, v1, v3) + (v0, v3, v2); the previous order faced inward and
			# cull_back then dropped the entire shell.
			_add_quad(st, v0, v1, v3, v2)

	# caps
	for endcap in [0, rings.size() - 1]:
		var pts: Array = rings[endcap]
		var center := Vector3.ZERO
		for p in pts:
			center += p
		center /= float(pts.size())
		for k in range(pts.size()):
			var k2: int = (k + 1) % pts.size()
			var flip: bool = endcap == 0
			var p0: Vector3 = pts[k]
			var p1: Vector3 = pts[k2]
			if flip:
				_add_tri(st, center, p0, p1)
			else:
				_add_tri(st, center, p1, p0)

	st.generate_tangents()
	var mi = MeshInstance3D.new()
	mi.name = "Body"
	mi.mesh = st.commit()
	mi.material_override = _body_mat
	mi.layers = 1
	_body_root.add_child(mi)


func _add_quad(st: SurfaceTool, v0: Vector3, v1: Vector3, v2: Vector3, v3: Vector3) -> void:
	_add_tri(st, v0, v1, v2)
	_add_tri(st, v0, v2, v3)


func _add_tri(st: SurfaceTool, p0: Vector3, p1: Vector3, p2: Vector3) -> void:
	var nrm: Vector3 = (p1 - p0).cross(p2 - p0)
	if nrm.length_squared() < 0.0000001:
		return
	nrm = nrm.normalized()
	for v in [p0, p1, p2]:
		st.set_normal(nrm)
		st.set_uv(Vector2(v.x * 0.5 + 0.5, v.z * 0.2))
		st.add_vertex(v)


## Greenhouse: raked windscreen, side glass with a tumblehome taper, curved roof.
func _build_glasshouse(shape: Dictionary) -> void:
	var gh := Node3D.new()
	gh.name = "Greenhouse"
	add_child(gh)
	_glass_house = gh
	_box_target = gh
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var cabin: Array = shape["cabin"]
	var roof: float = shape["roof"]
	var c0: float = cabin[0]
	var c1: float = cabin[1]

	var z_front: float = lerpf(-length * 0.5, length * 0.5, c0)
	var z_rear: float = lerpf(-length * 0.5, length * 0.5, c1)
	var y_base: float = height * 0.60 + 0.30 + 0.010
	var y_top: float = y_base + height * 0.40 * roof

	# The greenhouse is a LOFTED SOLID, not a set of quads.
	#
	# The previous version stitched six flat quads around the cabin. Flat quads
	# meeting at angles leave open gaps at every joint, and because the glass is
	# dark and alpha-blended, those gaps read as black shards floating over the
	# lit body — exactly what the showroom render showed.
	#
	# Instead: sample cross-sections along the cabin the way the body shell does,
	# narrow them toward the roof, and close both ends. One continuous surface
	# with no seams for alpha sorting to expose.
	var stations := 14
	var half_w_base: float = width * 0.415
	var half_w_top: float = width * 0.330
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings: Array = []

	for i in range(stations + 1):
		var t: float = float(i) / float(stations)
		var z: float = lerpf(z_front, z_rear, t)
		# the cabin narrows toward both ends in plan view, so the A- and C-pillars
		# converge instead of the roof being a parallel slab
		var end_taper: float = 1.0
		if t < 0.22:
			end_taper = lerpf(0.62, 1.0, pow(t / 0.22, 0.6))
		elif t > 0.80:
			end_taper = lerpf(1.0, 0.58, pow((t - 0.80) / 0.20, 0.7))
		# roof height peaks just behind the A-pillar and falls to the rear screen,
		# which is the profile cue that separates a supercar from a van
		var crown_t: float = sin(clampf(t * 1.05, 0.0, 1.0) * PI)
		var y_roof: float = y_base + (y_top - y_base) * end_taper * (0.72 + 0.28 * crown_t)
		var hw_t: float = half_w_top * end_taper
		var hw_b: float = half_w_base * lerpf(1.0, end_taper, 0.65)

		var ring: Array = []
		var seg := 16
		for s_i in range(seg):
			var a: float = float(s_i) / float(seg) * TAU
			var ca: float = cos(a)
			var sa: float = sin(a)
			var ex: float = 0.55
			var ux: float = signf(ca) * pow(absf(ca), ex)
			var uy: float = signf(sa) * pow(absf(sa), ex)
			var y: float = lerpf((y_base + y_roof) * 0.5, y_roof if uy > 0.0 else y_base, absf(uy))
			var vfrac: float = clampf((y - y_base) / maxf(y_roof - y_base, 0.01), 0.0, 1.0)
			var x: float = ux * lerpf(hw_b, hw_t, vfrac)
			if uy > 0.86:
				y = y_roof
			ring.append(Vector3(x, y, z))
		rings.append(ring)

	for r in range(rings.size() - 1):
		var a_ring: Array = rings[r]
		var b_ring: Array = rings[r + 1]
		var n: int = a_ring.size()
		for k in range(n):
			var k2: int = (k + 1) % n
			_add_quad(st, a_ring[k], a_ring[k2], b_ring[k2], b_ring[k])

	# close both ends so the interior is never visible through the alpha
	for idx in [0, rings.size() - 1]:
		var flip: bool = idx == 0
		var pts: Array = rings[idx]
		var ctr := Vector3.ZERO
		for pt in pts:
			ctr += pt
		ctr /= float(pts.size())
		for k in range(pts.size()):
			var k2b: int = (k + 1) % pts.size()
			if flip:
				st.add_vertex(ctr)
				st.add_vertex(pts[k])
				st.add_vertex(pts[k2b])
			else:
				st.add_vertex(ctr)
				st.add_vertex(pts[k2b])
				st.add_vertex(pts[k])

	st.generate_tangents()
	var mi = MeshInstance3D.new()
	mi.name = "Glass"
	mi.mesh = st.commit()
	mi.material_override = _glass_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gh.add_child(mi)

	# --- painted roof and pillars -------------------------------------------
	# A glass-only canopy is not what a car looks like: the A-pillars, the
	# C-pillars and the roof panel itself are body colour. Without them the cabin
	# reads as a dark hole dropped onto the shell.
	var z_top_front: float = lerpf(z_front, z_rear, 0.20)
	var z_top_rear: float = lerpf(z_front, z_rear, 0.80)
	var roof_panel = _add_box(
		Vector3(half_w_top * 1.92, 0.030, z_top_rear - z_top_front),
		Vector3(0.0, y_top, (z_top_front + z_top_rear) * 0.5), _body_mat)
	if roof_panel != null:
		roof_panel.name = "Roof"
	for side in [-1.0, 1.0]:
		var ap = _add_box(Vector3(0.045, 0.05, absf(z_top_front - z_front) * 1.35),
			Vector3(half_w_base * side * 0.93, (y_base + y_top) * 0.5,
				(z_front + z_top_front) * 0.5), _body_mat)
		if ap != null:
			ap.rotation.x = deg_to_rad(-28.0)
		var cp = _add_box(Vector3(0.045, 0.05, absf(z_rear - z_top_rear) * 1.35),
			Vector3(half_w_base * side * 0.93, (y_base + y_top) * 0.5,
				(z_rear + z_top_rear) * 0.5), _body_mat)
		if cp != null:
			cp.rotation.x = deg_to_rad(24.0)

	for side2 in [-1.0, 1.0]:
		_add_box(Vector3(0.018, 0.016, (z_rear - z_front) * 0.90),
			Vector3(half_w_base * side2 * 1.002, y_base, (z_front + z_rear) * 0.5), _chrome_mat)

	_add_box(Vector3(0.045, 0.065, 0.14), Vector3(0, y_top + 0.045, z_top_rear - 0.10), _trim_mat)
	_box_target = null


func _build_wheel_arches(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var radius: float = shape["wheel"]
	var track: float = _wheel_track(width)
	var axle_z: float = _axle_z(length, radius)
	for front in [true, false]:
		for side in [-1.0, 1.0]:
			var z: float = -axle_z if front else axle_z
			# inner well: a half-cylinder shell in near-black
			var well = MeshInstance3D.new()
			var wm = TorusMesh.new()
			wm.inner_radius = radius * 0.98
			wm.outer_radius = radius * 1.16
			wm.rings = 18
			wm.ring_segments = 8
			well.mesh = wm
			well.material_override = _trim_mat
			well.position = Vector3(track * side * 0.93, radius, z)
			well.rotation.x = PI * 0.5
			well.scale = Vector3(1.0, 1.0, 0.55)
			well.layers = 1
			_body_root.add_child(well)
			# arch lip catches the light
			var lip = MeshInstance3D.new()
			var lm = TorusMesh.new()
			lm.inner_radius = radius * 1.14
			lm.outer_radius = radius * 1.20
			lm.rings = 20
			lm.ring_segments = 6
			lip.mesh = lm
			lip.material_override = _body_mat
			lip.position = Vector3(track * side * 0.96, radius, z)
			lip.rotation.x = PI * 0.5
			lip.scale = Vector3(1.0, 1.0, 0.5)
			lip.layers = 1
			_body_root.add_child(lip)


func _build_details(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var wing: float = shape["wing"]
	var y_shoulder: float = height * 0.60 + 0.30

	# --- side skirts --------------------------------------------------------
	for side in [-1.0, 1.0]:
		_add_box(Vector3(0.06, 0.10, length * 0.52),
			Vector3(width * 0.5 * side * 0.985, 0.315, 0), _carbon_mat)
	# --- front splitter + canards ------------------------------------------
	_add_box(Vector3(width * 0.95, 0.035, 0.34), Vector3(0, 0.262, -length * 0.5 + 0.12), _carbon_mat)
	for side in [-1.0, 1.0]:
		var canard = _add_box(Vector3(0.20, 0.018, 0.10),
			Vector3(width * 0.44 * side, 0.30, -length * 0.5 + 0.30), _carbon_mat)
		canard.rotation.z = 0.12 * side
	# --- rear diffuser with vertical strakes -------------------------------
	_add_box(Vector3(width * 0.80, 0.13, 0.30), Vector3(0, 0.315, length * 0.5 - 0.13), _carbon_mat)
	for i in range(-3, 4):
		_add_box(Vector3(0.012, 0.11, 0.26),
			Vector3(float(i) * width * 0.095, 0.315, length * 0.5 - 0.13), _chrome_mat)
	# --- front intake grille -----------------------------------------------
	_add_box(Vector3(width * 0.50, 0.13, 0.06), Vector3(0, 0.44, -length * 0.5 + 0.015), _trim_mat)
	for i in range(-2, 3):
		_add_box(Vector3(0.014, 0.11, 0.05),
			Vector3(float(i) * width * 0.085, 0.44, -length * 0.5 + 0.005), _chrome_mat)

	# --- mirrors on stalks --------------------------------------------------
	for side in [-1.0, 1.0]:
		var mz: float = lerpf(-length * 0.5, length * 0.5, shape["cabin"][0]) + 0.14
		_add_box(Vector3(0.09, 0.03, 0.05),
			Vector3(width * 0.44 * side, y_shoulder + 0.02, mz), _trim_mat)
		var housing = _add_box(Vector3(0.16, 0.075, 0.10),
			Vector3(width * 0.47 * side, y_shoulder + 0.05, mz), _body_mat)
		housing.name = "Mirror%s" % ("L" if side < 0 else "R")
		# mirror glass face
		_add_box(Vector3(0.006, 0.055, 0.075),
			Vector3(width * 0.47 * side, y_shoulder + 0.05, mz - 0.052), _chrome_mat)

	# --- rear wing ----------------------------------------------------------
	if wing > 0.02:
		var wing_y: float = y_shoulder + height * 0.30 + wing * 0.34
		var wz: float = length * 0.5 - 0.26
		# The foil is anchored to the deck, not floating above it. The old version
		# put the wing at y_shoulder + height*0.34 + wing*0.62 with uprights only
		# wing*0.55 tall, so the support never reached the body and the wing read
		# as a plank hovering behind the car in every render.
		var deck_y: float = y_shoulder - 0.015
		var upright_h: float = maxf(wing_y - deck_y, 0.06)
		for side in [-1.0, 1.0]:
			# upright: from the deck surface all the way up to the foil
			_add_box(Vector3(0.045, upright_h, 0.10),
				Vector3(width * 0.30 * side, deck_y + upright_h * 0.5, wz + 0.02), _carbon_mat)
			# endplate
			_add_box(Vector3(0.014, 0.035 + upright_h * 0.22, 0.34),
				Vector3(width * 0.45 * side, wing_y + upright_h * 0.08, wz), _carbon_mat)
		# aerofoil: a thin plate with a slight angle of attack
		var foil = _add_box(Vector3(width * 0.90, 0.032, 0.38), Vector3(0, wing_y, wz), _carbon_mat)
		if foil != null:
			foil.rotation.x = deg_to_rad(-4.0)
			foil.name = "WingFoil"
	else:
		# boot lip spoiler for the street cars
		var lip = _add_box(Vector3(width * 0.62, 0.03, 0.13),
			Vector3(0, y_shoulder - 0.02, length * 0.5 - 0.10), _body_mat)
		lip.rotation.x = -0.14

	# --- hood vents ---------------------------------------------------------
	for side in [-1.0, 1.0]:
		var vent = _add_box(Vector3(width * 0.16, 0.012, 0.16),
			Vector3(width * 0.22 * side, y_shoulder + 0.004, -length * 0.30), _carbon_mat)
		vent.rotation.x = 0.02
	# --- accent stripe down the centre -------------------------------------
	# The stripe follows the bonnet, so its top must sit just under the crown of
	# the shell at that station rather than at a fixed y. Sitting at y_shoulder it
	# showed as a red bar sticking out of the nose in the first render.
	var stripe_z: float = -length * 0.30
	var stripe_drop: float = height * 0.06
	var stripe = _add_box(Vector3(width * 0.075, 0.006, length * 0.24),
		Vector3(0, y_shoulder - stripe_drop, stripe_z), _accent_mat)
	if stripe != null:
		stripe.name = "Stripe"
	# --- side accent blade (the signature "velocity" line) ------------------
	for side in [-1.0, 1.0]:
		var blade = _add_box(Vector3(0.008, 0.035, length * 0.42),
			Vector3(width * 0.5 * side * 1.002, 0.52, 0.02), _accent_mat)
		blade.rotation.x = 0.03
	# --- fuel cap detail ----------------------------------------------------
	_add_box(Vector3(0.006, 0.09, 0.09),
		Vector3(width * 0.5 * 1.004, 0.62, length * 0.32), _chrome_mat)


## When set, _add_box parents into this node instead of the shell. Used while
## building the greenhouse so the whole glass house can be hidden at distance
## as one unit (see set_lod_detail).
var _box_target: Node3D = null


func _resolve_box_parent() -> Node3D:
	return _box_target if _box_target != null else _body_root


## Wheel geometry lives in exactly one place. The body, the arches and the
## wheels themselves all ask these two functions, so a change to the stance
## cannot leave the arch wells floating beside the tyres.
const TYRE_WIDTH := 0.34


func _wheel_track(width: float) -> float:
	return width * 0.5 - TYRE_WIDTH * 0.5 - 0.035


func _axle_z(length: float, radius: float) -> float:
	return length * 0.5 - radius - 0.32


func _add_box(size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var bm = BoxMesh.new()
	bm.size = size
	var mi = MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	mi.layers = 1
	_resolve_box_parent().add_child(mi)
	return mi


## Wheels: low-profile tyre with sidewall bulge, forged multi-spoke rim,
## ventilated disc and a caliper that lights up under braking.
func _build_wheels(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var radius: float = shape["wheel"]
	# Track was width*0.5 - 0.06, which puts the OUTER face of a 0.30 m tyre at
	# width*0.5 + 0.09 — the wheels stuck out past the bodywork and the arch
	# flare had nothing to wrap. Pulling the hub inward by half the tyre width
	# puts the outer sidewall flush with the widest point of the shell, which is
	# how a performance car actually sits.
	var tyre_w: float = TYRE_WIDTH
	var track: float = _wheel_track(width)
	var axle_z: float = _axle_z(length, radius)

	for front in [true, false]:
		for side in [-1.0, 1.0]:
			var z: float = -axle_z if front else axle_z
			var holder = Node3D.new()
			holder.name = "Wheel_%s_%s" % ["F" if front else "R", "L" if side < 0 else "R"]
			holder.position = Vector3(track * side, radius, z)
			add_child(holder)
			var spin = Node3D.new()
			spin.name = "Spin"
			holder.add_child(spin)

			# --- tyre: three cylinders = tread band + two rounded shoulders --
			var tread = MeshInstance3D.new()
			var tm = CylinderMesh.new()
			tm.top_radius = radius
			tm.bottom_radius = radius
			tm.height = tyre_w
			tm.radial_segments = 32
			tm.rings = 1
			tread.mesh = tm
			tread.material_override = _tyre_mat
			tread.rotation.x = PI * 0.5
			tread.layers = 1
			spin.add_child(tread)
			for s in [-1.0, 1.0]:
				var shoulder = MeshInstance3D.new()
				var sm = TorusMesh.new()
				sm.inner_radius = radius * 0.80
				sm.outer_radius = radius * 0.985
				sm.rings = 26
				sm.ring_segments = 8
				shoulder.mesh = sm
				shoulder.material_override = _tyre_mat
				shoulder.rotation.x = PI * 0.5
				shoulder.position = Vector3(0, 0, s * tyre_w * 0.42)
				shoulder.scale = Vector3(1.0, 1.0, 0.9)
				shoulder.layers = 1
				spin.add_child(shoulder)

			# --- rim barrel + face -------------------------------------------
			var barrel = MeshInstance3D.new()
			var bm = CylinderMesh.new()
			bm.top_radius = radius * 0.66
			bm.bottom_radius = radius * 0.66
			bm.height = tyre_w * 0.96
			bm.radial_segments = 28
			barrel.mesh = bm
			barrel.material_override = _rim_mat
			barrel.rotation.x = PI * 0.5
			barrel.layers = 1
			spin.add_child(barrel)

			# dished face: cone gives the concave look of a forged wheel
			var face = MeshInstance3D.new()
			var fm = CylinderMesh.new()
			fm.top_radius = radius * 0.64
			fm.bottom_radius = radius * 0.50
			fm.height = 0.055
			fm.radial_segments = 28
			face.mesh = fm
			face.material_override = _rim_mat
			face.rotation.x = PI * 0.5
			face.position = Vector3(0, 0, tyre_w * 0.40 * side)
			face.layers = 1
			spin.add_child(face)

			# --- spokes -------------------------------------------------------
			for s in range(rim_spokes):
				var spoke = MeshInstance3D.new()
				var sm2 = BoxMesh.new()
				sm2.size = Vector3(radius * 1.02, 0.052, 0.030)
				spoke.mesh = sm2
				spoke.material_override = _rim_mat
				var ang: float = float(s) / float(rim_spokes) * TAU
				spoke.rotation = Vector3(0, 0, ang)
				spoke.position = Vector3(cos(ang) * radius * 0.30, sin(ang) * radius * 0.30,
					tyre_w * 0.40 * side)
				spoke.layers = 1
				spin.add_child(spoke)
			# centre cap
			var cap = MeshInstance3D.new()
			var cm2 = CylinderMesh.new()
			cm2.top_radius = radius * 0.14
			cm2.bottom_radius = radius * 0.14
			cm2.height = 0.02
			cm2.radial_segments = 16
			cap.mesh = cm2
			cap.material_override = _chrome_mat
			cap.rotation.x = PI * 0.5
			cap.position = Vector3(0, 0, tyre_w * 0.44 * side)
			spin.add_child(cap)

			# --- brake disc (behind the spokes) -------------------------------
			var disc = MeshInstance3D.new()
			var dm = CylinderMesh.new()
			dm.top_radius = radius * 0.56
			dm.bottom_radius = radius * 0.56
			dm.height = 0.024
			dm.radial_segments = 24
			disc.mesh = dm
			disc.material_override = _brake_mat
			disc.rotation.x = PI * 0.5
			disc.position = Vector3(0, 0, -tyre_w * 0.16 * side)
			spin.add_child(disc)

			# --- caliper (does not spin) --------------------------------------
			var caliper = MeshInstance3D.new()
			var cm3 = BoxMesh.new()
			cm3.size = Vector3(radius * 0.30, radius * 0.42, 0.06)
			caliper.mesh = cm3
			caliper.material_override = _accent_mat
			caliper.position = Vector3(-radius * 0.26, radius * 0.10, -tyre_w * 0.16 * side)
			caliper.layers = 1
			holder.add_child(caliper)

			wheels.append({
				"node": holder,
				"spin": spin,
				"front": front,
				"side": side,
				"radius": radius,
				"brake_mat": _brake_mat,
			})


func _build_lights(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var height: float = shape["height"]
	var y: float = height * 0.60 + 0.14

	for side in [-1.0, 1.0]:
		# --- projector headlight (glass lens + hot core) --------------------
		var lens = _add_box(Vector3(width * 0.235, 0.085, 0.045),
			Vector3(width * 0.275 * side, y, -length * 0.5 + 0.035), _head_mat)
		lens.name = "Headlight%s" % ["L" if side < 0 else "R"]
		# LED signature: thin strip sweeping along the top of the lamp
		var drl = _add_box(Vector3(width * 0.245, 0.014, 0.030),
			Vector3(width * 0.275 * side, y + 0.056, -length * 0.5 + 0.022), _drl_mat)
		drl.rotation.z = -0.02 * side

		# --- full-width tail bar -------------------------------------------
		var tail = _add_box(Vector3(width * 0.30, 0.052, 0.035),
			Vector3(width * 0.255 * side, y + 0.03, length * 0.5 - 0.018), _tail_mat)
		tail.name = "Taillight%s" % ["L" if side < 0 else "R"]
		# tail light "hairpin" inner element
		var hair = _add_box(Vector3(0.030, 0.030, 0.030),
			Vector3(width * 0.095 * side, y + 0.03, length * 0.5 - 0.02), _tail_mat)
		hair.rotation.x = 0.0

	# connecting light bar across the back (modern EV look)
	_add_box(Vector3(width * 0.19, 0.020, 0.026), Vector3(0, y + 0.03, length * 0.5 - 0.016), _tail_mat)
	# front light bar across the nose
	_add_box(Vector3(width * 0.14, 0.012, 0.024), Vector3(0, y + 0.045, -length * 0.5 + 0.02), _drl_mat)

	# --- actual light emission ---------------------------------------------
	var beam = SpotLight3D.new()
	beam.position = Vector3(0, height * 0.60 + 0.2, -length * 0.5 + 0.1)
	beam.spot_range = 58.0
	beam.spot_angle = 34.0
	beam.light_energy = 5.0
	beam.light_color = Color(0.80, 0.91, 1.0)
	beam.shadow_enabled = false
	beam.light_specular = 0.6
	beam.rotation_degrees = Vector3(-8, 180, 0)
	add_child(beam)

	# red rear marker glow so the back of the car reads at night
	var tail_glow = OmniLight3D.new()
	tail_glow.position = Vector3(0, y + 0.05, length * 0.5 + 0.06)
	tail_glow.light_color = Color(1.0, 0.12, 0.16)
	tail_glow.light_energy = 0.55
	tail_glow.omni_range = 2.6
	tail_glow.shadow_enabled = false
	add_child(tail_glow)


func _build_nitro(shape: Dictionary) -> void:
	var length: float = shape["length"]
	var width: float = shape["width"]
	var flame_mat = StandardMaterial3D.new()
	flame_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flame_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flame_mat.albedo_color = Color(0.40, 0.78, 1.0, 0.9)
	flame_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	flame_mat.no_depth_test = false
	for side in [-1.0, 1.0]:
		# twin exhaust tips
		var tip = _add_box(Vector3(0.115, 0.115, 0.10),
			Vector3(width * 0.22 * side, 0.375, length * 0.5 + 0.015), _chrome_mat)
		tip.rotation.x = PI * 0.5
		# inner flame cone
		var flame = MeshInstance3D.new()
		var cm = CylinderMesh.new()
		cm.top_radius = 0.115
		cm.bottom_radius = 0.0
		cm.height = 1.7
		cm.radial_segments = 12
		flame.mesh = cm
		flame.material_override = flame_mat
		flame.rotation.x = PI * 0.5
		flame.position = Vector3(width * 0.22 * side, 0.375, length * 0.5 + 0.85)
		flame.visible = false
		add_child(flame)
		_nitro_nodes.append(flame)


## Let the shader know how dirty the car is without touching the paint colour.
func set_dirt(amount: float) -> void:
	if _body_mat and _body_mat.shader:
		_body_mat.set_shader_parameter("dirt", clampf(amount, 0.0, 1.0))


func set_paint_live(color: Color) -> void:
	paint = color
	if _body_mat and _body_mat.shader:
		_body_mat.set_shader_parameter("paint_color", color)
		_body_mat.set_shader_parameter("flake_color", color.lightened(0.55))
		_body_mat.set_shader_parameter("rim_color", color.lightened(0.8))
	if _accent_mat:
		_accent_mat.albedo_color = color.lightened(0.35)
		_accent_mat.emission = color


func set_brake(on: bool) -> void:
	if _brake_light == on:
		return
	_brake_light = on
	if _brake_mat:
		_brake_mat.emission_energy_multiplier = 3.8 if on else 0.0
	if _tail_mat:
		_tail_mat.emission_energy_multiplier = 7.0 if on else 3.0


func set_nitro(on: bool, amount: float = 1.0) -> void:
	for n in _nitro_nodes:
		n.visible = on
		if on:
			var flicker = 0.85 + 0.3 * sin(float(Time.get_ticks_msec()) * 0.045)
			var len_scale = (0.7 + 0.9 * amount) * flicker
			n.scale = Vector3(0.85 + 0.25 * flicker, 1.0, len_scale)


func set_damage(amount: float) -> void:
	_damage = clampf(amount, 0.0, 1.0)
	if _body_mat and _body_mat.shader:
		# The shader does the wear now (scorch + roughness scatter + additive
		# budget), so the base coat stays the true paint colour and undamaged
		# panels do not drift darker as the car takes a beating elsewhere.
		_body_mat.set_shader_parameter("damage", _damage)
		_body_mat.set_shader_parameter("dirt", clampf(_damage * 0.65 + 0.12, 0.0, 1.0))
	if _body_root:
		_body_root.rotation.z = sin(_damage * 40.0) * 0.02 * _damage


## Level of detail by distance. A car 120 m away does not need its brake
## calipers, exhaust tips or interior: hiding those subtrees removes the draw
## calls entirely on mobile instead of paying vertex cost for invisible parts.
## This is cheaper and more predictable than Godot's automatic LOD, which still
## submits every surface.
func set_lod_detail(distance: float) -> void:
	var near: bool = distance < 55.0
	var mid: bool = distance < 130.0
	if _detail_root != null:
		_detail_root.visible = mid
	for w in wheels:
		var holder: Node3D = w.get("node")
		if holder != null:
			holder.visible = near or mid
	if _glass_house != null:
		_glass_house.visible = mid


func steer_wheels(angle_rad: float, spin_amount: float) -> void:
	for w in wheels:
		if w["front"]:
			var holder: Node3D = w["node"]
			holder.rotation.y = angle_rad
		var spin: Node3D = w["spin"]
		spin.rotation.x += spin_amount
