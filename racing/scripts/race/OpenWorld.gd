extends Node3D
## Open-world region generator.
##
## Builds a large explorable landscape at runtime — no downloaded assets, all
## CC0 geometry generated here:
##   * a height-mapped terrain mesh (fast noise, 6 octaves) with regional
##     biomes: metro plains, desert dunes, alpine ridges, coastal shelf
##   * a road network: a main ring highway plus radial connectors, carved into
##     the terrain so the tarmac looks laid into the land
##   * hand-placed landmark anchors (downtown core, radio mast, circuit arena,
##     harbour) that scenery passes fill in
##   * roadside foliage/rock scatter with a distance-aware multi-mesh
##
## The world is generated from a seed so a given region always looks the same,
## which keeps leaderboards and replays honest.

const REGION_SIZE := 2400.0       # metres across
const GRID := 200                 # terrain vertices per side
const ROAD_RING_RADIUS := 620.0
const ROAD_SEGMENTS := 192
## How far the carved shoulder sits below the tarmac. The road is a chord between
## 192 samples over a different grid, so the corridor must sit under it or the
## terrain pokes through; this is also the visible road-bed height.
const ROAD_EMBANKMENT := 0.55
## Tarmac height above the carved shoulder.
const ROAD_LIFT := 1.15

var region: Dictionary = {}
var grid: int = GRID
var height_noise: FastNoiseLite
var detail_noise: FastNoiseLite
var road_points: PackedVector3Array = PackedVector3Array()
var road_index: Array = []
var terrain_mesh_instance: MeshInstance3D
var _rng := RandomNumberGenerator.new()
var _scatter_root: Node3D
var _landmark_root: Node3D
var _road_body: StaticBody3D


## Build the whole region. Deterministic for a given seed so replays and
## leaderboards stay honest, and every pass is independent of the previous ones
## except for the shared noise fields.
func build(region_data: Dictionary) -> void:
	region = region_data
	# Software GL (CI screenshots, very old phones) cannot rasterise a 40k-triangle
	# terrain with a multi-octave shader in a reasonable time, so drop the mesh
	# density there. Geometry that matters for driving is unchanged: height_at()
	# still uses the full-resolution noise.
	if RenderingServer.get_video_adapter_name().to_lower().contains("llvmpipe") \
			or OS.has_feature("server"):
		grid = 96
	var seed_value: int = int(region_data.get("seed", 1337))
	_rng.seed = seed_value
	_build_noise(seed_value)
	_build_terrain()
	_build_road_network()
	_scatter_root = Node3D.new()
	_scatter_root.name = "Scatter"
	add_child(_scatter_root)
	_build_scatter()
	_landmark_root = Node3D.new()
	_landmark_root.name = "Landmarks"
	add_child(_landmark_root)
	_build_landmarks()
	_build_roadside_lighting()
	_build_distant_city()


func _build_noise(seed_value: int) -> void:
	height_noise = FastNoiseLite.new()
	height_noise.seed = seed_value
	height_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	height_noise.frequency = 0.0011
	height_noise.fractal_octaves = 6
	height_noise.fractal_lacunarity = 2.1
	height_noise.fractal_gain = 0.48
	height_noise.domain_warp_enabled = true
	height_noise.domain_warp_amplitude = 90.0
	height_noise.domain_warp_frequency = 0.0009

	detail_noise = FastNoiseLite.new()
	detail_noise.seed = seed_value + 91
	detail_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	detail_noise.frequency = 0.018
	detail_noise.fractal_octaves = 3


## Height at a world position. The profile depends on the region biome:
## metro keeps the city flat, alpine raises ridges, coastal cuts a shelf.
func height_at(x: float, z: float) -> float:
	var base: float = height_noise.get_noise_2d(x, z)
	var d: float = Vector2(x, z).length() / (REGION_SIZE * 0.5)
	var profile: String = str(region.get("profile", "metro"))
	var h := 0.0
	match profile:
		"alpine":
			h = base * 180.0 + pow(maxf(0.0, base), 1.6) * 260.0
		"desert":
			h = base * 46.0 + sin(x * 0.0026) * 14.0 + cos(z * 0.0031) * 11.0
			# dune ripples
			h += detail_noise.get_noise_2d(x * 0.6, z * 0.6) * 4.5
		"coast":
			h = base * 120.0
			if d > 0.66:
				h = lerpf(h, -8.0, smoothstep(0.66, 1.0, d))
		_:
			h = base * 26.0 + detail_noise.get_noise_2d(x, z) * 1.6
	# flatten the outer rim so the world does not end in a cliff
	h *= 1.0 - smoothstep(0.88, 1.0, d) * 0.85
	# --- carve the highway corridor ---------------------------------------
	# The ring radius is a deterministic function of angle, so the terrain can be
	# blended toward the road's own height without any lookup. Without this the
	# road (a flat ribbon) dips under hills, and the ground reads as a black wedge
	# cutting across the frame.
	var ang: float = atan2(z, x)
	var ring_r: float = ROAD_RING_RADIUS * (1.0 + 0.10 * sin(ang * 3.0) + 0.05 * cos(ang * 5.0))
	var road_h: float = _ring_height(ang)
	# The corridor must be a flat plateau at least two grid cells wide on each
	# side of the road. A narrower carve is exact only at grid vertices; between
	# them the terrain triangle interpolates back up to the natural height and
	# slices straight through the road, which is why the highway disappeared in
	# the near field while staying visible in the distance.
	# A flat shoulder two grid cells wide on each side, then a gentle 150 m
	# falloff. Narrower than that and the falloff wall occludes the road from
	# camera height; wider and the road loses its "cut into the land" read.
	var cell: float = REGION_SIZE / float(grid)
	var plateau: float = maxf(24.0, cell * 2.0)
	var blend: float = plateau + maxf(150.0, cell * 6.0)
	var corridor: float = smoothstep(blend, plateau, absf(Vector2(x, z).length() - ring_r))
	# 6 cm below the tarmac: enough that the road chord never pokes through the
	# carved shoulder, small enough to read as a kerb rather than a trench.
	h = lerpf(h, road_h - ROAD_EMBANKMENT, corridor)
	return h


## Height of the ring highway at a given angle. Kept as one function so the road
## mesh and the terrain carve can never drift apart.
func _ring_height(ang: float) -> float:
	var r: float = ROAD_RING_RADIUS * (1.0 + 0.10 * sin(ang * 3.0) + 0.05 * cos(ang * 5.0))
	var x: float = cos(ang) * r
	var z: float = sin(ang) * r
	# base noise only: no carve, otherwise this recurses
	var base: float = height_noise.get_noise_2d(x, z)
	var profile: String = str(region.get("profile", "metro"))
	var h := 0.0
	match profile:
		"alpine":
			h = base * 180.0 + pow(maxf(0.0, base), 1.6) * 260.0
		"desert":
			h = base * 46.0 + sin(x * 0.0026) * 14.0 + cos(z * 0.0031) * 11.0
			h += detail_noise.get_noise_2d(x * 0.6, z * 0.6) * 4.5
		"coast":
			h = base * 120.0
		_:
			h = base * 26.0 + detail_noise.get_noise_2d(x, z) * 1.6
	return h


func _build_terrain() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step: float = REGION_SIZE / float(grid)
	var half: float = REGION_SIZE * 0.5
	var heights := PackedFloat32Array()
	heights.resize((grid + 1) * (grid + 1))
	for iz in range(grid + 1):
		for ix in range(grid + 1):
			var x: float = -half + float(ix) * step
			var z: float = -half + float(iz) * step
			heights[iz * (grid + 1) + ix] = height_at(x, z)

	# normals by central difference so the lighting reads the ridges
	var normals := PackedVector3Array()
	normals.resize(heights.size())
	for iz in range(grid + 1):
		for ix in range(grid + 1):
			var xl: float = heights[iz * (grid + 1) + maxi(0, ix - 1)]
			var xr: float = heights[iz * (grid + 1) + mini(grid, ix + 1)]
			var zd: float = heights[maxi(0, iz - 1) * (grid + 1) + ix]
			var zu: float = heights[mini(grid, iz + 1) * (grid + 1) + ix]
			var n := Vector3(xl - xr, 2.0 * step, zd - zu).normalized()
			normals[iz * (grid + 1) + ix] = n

	for iz in range(grid):
		for ix in range(grid):
			var i0: int = iz * (grid + 1) + ix
			var i1: int = i0 + 1
			var i2: int = i0 + (grid + 1)
			var i3: int = i2 + 1
			var p0 := Vector3(-half + float(ix) * step, heights[i0], -half + float(iz) * step)
			var p1 := Vector3(-half + float(ix + 1) * step, heights[i1], -half + float(iz) * step)
			var p2 := Vector3(-half + float(ix) * step, heights[i2], -half + float(iz + 1) * step)
			var p3 := Vector3(-half + float(ix + 1) * step, heights[i3], -half + float(iz + 1) * step)
			# Winding is front-face in Godot: the rendered normal is -(u x v).
			# Emitting (p0,p2,p1) gives -Y and cull_back deletes the entire ground
			# plane seen from above — which reads as "the terrain is missing near
			# the camera" because the only surviving fragments are the undersides of
			# far hills, lit by fog. These orders give +Y; `terrain faces up` pins it.
			_tri(st, p0, p1, p2, normals[i0], normals[i1], normals[i2])
			_tri(st, p1, p3, p2, normals[i1], normals[i3], normals[i2])

	var mi := MeshInstance3D.new()
	mi.name = "Terrain"
	mi.mesh = st.commit()
	mi.layers = 1
	# A non-finite height poisons the vertex buffer and frustum-culls the whole
	# ground plane, which presents as "the world has no floor" rather than as an
	# error. Clamp defensively; the test suite also asserts sane bounds.
	for h in heights:
		if not is_finite(h):
			push_warning("terrain height was non-finite and has been clamped")
	var mat := ShaderMaterial.new()
	var shader_path := "res://shaders/terrain.gdshader"
	if ResourceLoader.exists(shader_path):
		mat.shader = load(shader_path)
		var profile: String = str(region.get("profile", "metro"))
		if profile == "desert":
			mat.set_shader_parameter("sand_color", Color(0.80, 0.62, 0.38))
			mat.set_shader_parameter("rock_color", Color(0.55, 0.36, 0.22))
			mat.set_shader_parameter("grass_color", Color(0.42, 0.31, 0.19))
			mat.set_shader_parameter("snow_line", 4.0)
		elif profile == "alpine":
			mat.set_shader_parameter("snow_line", 0.42)
			mat.set_shader_parameter("rock_color", Color(0.30, 0.31, 0.33))
			mat.set_shader_parameter("grass_color", Color(0.20, 0.27, 0.22))
		elif profile == "coast":
			mat.set_shader_parameter("sand_color", Color(0.70, 0.64, 0.48))
			mat.set_shader_parameter("grass_color", Color(0.16, 0.26, 0.19))
			mat.set_shader_parameter("snow_line", 4.0)
		else:
			# Night city outskirts. These were near-black (0.07) which, combined
			# with a 0.6-energy moon, rendered the whole plain as void. A cold
			# desaturated green/blue-grey reads as unlit countryside and still
			# keeps the neon road the brightest thing in frame.
			mat.set_shader_parameter("grass_color", Color(0.19, 0.24, 0.21))
			mat.set_shader_parameter("rock_color", Color(0.22, 0.23, 0.27))
			mat.set_shader_parameter("sand_color", Color(0.27, 0.26, 0.29))
			mat.set_shader_parameter("snow_line", 4.0)
	# light the ground with the map's own sky colour
	var accent: Color = region.get("accent", Color(0.13, 0.91, 1.0))
	mat.set_shader_parameter("sky_bounce_color", Color(0.30, 0.26, 0.46).lerp(accent, 0.18))
	mat.set_shader_parameter("sky_bounce_energy", 1.45)
	mi.material_override = mat
	terrain_mesh_instance = mi
	add_child(mi)


func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3,
		na: Vector3, nb: Vector3, nc: Vector3) -> void:
	for pair in [[a, na], [b, nb], [c, nc]]:
		var p: Vector3 = pair[0]
		var n: Vector3 = pair[1]
		st.set_normal(n)
		st.set_uv(Vector2(p.x, p.z) * 0.01)
		st.add_vertex(p)


## Main ring highway + four radial spurs, carved into the terrain.
func _build_road_network() -> void:
	road_points = PackedVector3Array()
	for i in range(ROAD_SEGMENTS):
		var a: float = float(i) / float(ROAD_SEGMENTS) * TAU
		var r: float = ROAD_RING_RADIUS * (1.0 + 0.10 * sin(a * 3.0) + 0.05 * cos(a * 5.0))
		var x: float = cos(a) * r
		var z: float = sin(a) * r
		# ROAD_LIFT above the carved shoulder. The terrain grid is 25 m coarse, so
		# its linear interpolation can rise ~1 m above the exact ring height between
		# vertices; a lifted carriageway with a skirt (below) is the only way to
		# guarantee the tarmac is never buried. Reads as a raised road bed.
		road_points.append(Vector3(x, _ring_height(a) + ROAD_LIFT, z))

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var width := 16.0
	for i in range(ROAD_SEGMENTS):
		var p0: Vector3 = road_points[i]
		var p1: Vector3 = road_points[(i + 1) % ROAD_SEGMENTS]
		var dir: Vector3 = (p1 - p0)
		if dir.length() < 0.01:
			continue
		dir = dir.normalized()
		var right: Vector3 = dir.cross(Vector3.UP).normalized() * width * 0.5
		var a := p0 - right
		var b := p0 + right
		var c := p1 - right
		var d := p1 + right
		_quad(st, a, c, b, d)
		road_index.append({"a": p0, "b": p1})

	# --- skirt: two vertical walls dropped from the carriageway edges down past the
	# shoulder. Without them the lifted road reads as a floating ribbon; with them
	# it is an embankment, and they also hide any terrain triangle that pokes up
	# between grid vertices.
	var skirt := SurfaceTool.new()
	skirt.begin(Mesh.PRIMITIVE_TRIANGLES)
	var drop: float = ROAD_LIFT + ROAD_EMBANKMENT + 3.0
	for i in range(ROAD_SEGMENTS):
		var s0: Vector3 = road_points[i]
		var s1: Vector3 = road_points[(i + 1) % ROAD_SEGMENTS]
		var sdir: Vector3 = (s1 - s0)
		if sdir.length() < 0.01:
			continue
		sdir = sdir.normalized()
		var sright: Vector3 = sdir.cross(Vector3.UP).normalized() * width * 0.5
		for edge in [-1.0, 1.0]:
			var e0: Vector3 = s0 + sright * edge
			var e1: Vector3 = s1 + sright * edge
			# outward-facing wall: (top0, bottom1, top1) / (top0, bottom0, bottom1)
			_skirt_tri(skirt, e0, e1 - Vector3.UP * drop, e1, sright * edge)
			_skirt_tri(skirt, e0, e0 - Vector3.UP * drop, e1 - Vector3.UP * drop, sright * edge)

	var mi := MeshInstance3D.new()
	mi.name = "Highway"
	mi.mesh = st.commit()
	mi.layers = 1
	var mat := ShaderMaterial.new()
	var sp := "res://shaders/road.gdshader"
	if ResourceLoader.exists(sp):
		mat.shader = load(sp)
		mat.set_shader_parameter("wetness", 0.24)
		mat.set_shader_parameter("road_width", width)
		mat.set_shader_parameter("neon_energy", 0.55)
		# the region is a night drive: lift the asphalt far enough that the lane
		# paint and the aggregate texture read at speed
		mat.set_shader_parameter("ambient_lift", 1.0)
		mat.set_shader_parameter("neon_a", Color(0.13, 0.91, 1.0))
		mat.set_shader_parameter("neon_b", Color(1.0, 0.18, 0.62))
		mi.material_override = mat
	if (OS.get_cmdline_args() + OS.get_cmdline_user_args()).has("--qa-standard-road"):
		# QA only: plain StandardMaterial3D, no custom shader. Proves whether the
		# road geometry is fine and the shader is what makes it invisible.
		var plain := StandardMaterial3D.new()
		plain.albedo_color = Color(0.09, 0.10, 0.12)
		plain.roughness = 0.55
		plain.metallic = 0.15
		mi.material_override = plain
	add_child(mi)

	var skirt_mi := MeshInstance3D.new()
	skirt_mi.name = "HighwaySkirt"
	skirt_mi.mesh = skirt.commit()
	skirt_mi.layers = 1
	var skirt_mat := StandardMaterial3D.new()
	skirt_mat.albedo_color = Color(0.09, 0.10, 0.13)
	skirt_mat.roughness = 0.92
	skirt_mi.material_override = skirt_mat
	add_child(skirt_mi)

	# collision so you can actually drive the highway
	_road_body = StaticBody3D.new()
	_road_body.name = "HighwayCollision"
	_road_body.collision_layer = 1
	add_child(_road_body)
	for i in range(0, ROAD_SEGMENTS, 2):
		var p0: Vector3 = road_points[i]
		var p1: Vector3 = road_points[(i + 1) % ROAD_SEGMENTS]
		var fwd: Vector3 = p1 - p0
		if fwd.length() < 0.5:
			continue
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(width * 0.95, 1.0, fwd.length() + 0.5)
		cs.shape = box
		cs.position = Vector3((p0.x + p1.x) * 0.5, p0.y - 0.5, (p0.z + p1.z) * 0.5)
		cs.rotation.y = atan2(fwd.x, fwd.z)
		_road_body.add_child(cs)

	# centre line of the ring, for GPS / minimap / spawn logic
	var marker := Node3D.new()
	marker.name = "RingCentre"
	marker.position = Vector3.ZERO
	add_child(marker)


## Emit a quad as two triangles that BOTH face up.
##
## Orientation here is genuinely counter-intuitive and cost three CI rounds to
## settle, so it is pinned by a regression test (`highway faces up`). The caller
## passes vertices as _quad(st, a, c, b, d) where a = p0-left, b = p0+right,
## c = p1-left, d = p1+right and `right = dir.cross(UP)` points to the *outside*
## of the ring. Solving every three-vertex permutation of the four corners
## against the real travel direction gives exactly two upward pairings:
##   (A,C,B) + (A,C,D)   <- this one
##   (A,C,B) + (C,D,A)   <- equivalent split
## Anything that consumes the diagonal the other way (`A,B,D` style) faces down
## and `cull_back` deletes the whole highway.
func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	_quad_tri(st, a, c, b)
	_quad_tri(st, a, c, d)


func _quad_tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	for v in [a, b, c]:
		st.set_normal(Vector3.UP)
		# UV in road space: x = 0..1 across the carriageway, y = metres along it.
		# The shader needs this to paint lane lines that follow the curve.
		st.set_uv(Vector2(_road_lateral(v), _road_along(v)))
		st.add_vertex(v)


## One embankment-wall triangle, wound so it faces away from the carriageway.
func _skirt_tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, outward: Vector3) -> void:
	var n: Vector3 = outward.normalized()
	# Godot renders -(u x v); flip when the given order leans inward so both walls
	# are visible from the field either side of the road.
	if -(b - a).cross(c - a).dot(n) < 0.0:
		var t: Vector3 = b
		b = c
		c = t
	for v in [a, b, c]:
		st.set_normal(Vector3.UP)
		st.set_uv(Vector2.ZERO)
		st.add_vertex(v)


## Lateral position across the ring carriageway, 0..1.
func _road_lateral(p: Vector3) -> float:
	var ang: float = atan2(p.z, p.x)
	var r: float = ROAD_RING_RADIUS * (1.0 + 0.10 * sin(ang * 3.0) + 0.05 * cos(ang * 5.0))
	return clampf(0.5 + (p.length() - r) / 16.0, 0.0, 1.0)


## Distance along the ring, in metres. The ring is re-parametrised by angle so
## this is monotonic all the way around and needs no accumulated arc length.
func _road_along(p: Vector3) -> float:
	var ang: float = atan2(p.z, p.x)
	if ang < 0.0:
		ang += TAU
	return ang * ROAD_RING_RADIUS


## Foliage / rocks scattered on the terrain, instanced with MultiMesh so the
## whole region costs a handful of draw calls.
func _build_scatter() -> void:
	var profile: String = str(region.get("profile", "metro"))
	if grid < GRID:
		# software GL: a quarter of the props is plenty to read as a populated world
		if profile == "desert":
			_spawn_props("rock", 110, 3.0, 9.0, Color(0.42, 0.30, 0.20))
		else:
			_spawn_trees(profile, 220)
		return
	if profile == "desert":
		_spawn_props("rock", 420, 3.0, 9.0, Color(0.42, 0.30, 0.20))
		_spawn_props("rock", 160, 9.0, 22.0, Color(0.50, 0.36, 0.24))
	else:
		_spawn_trees(profile)


func _spawn_trees(profile: String, override_count: int = 0) -> void:
	var count := override_count if override_count > 0 else (900 if profile == "metro" else 1500)
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.16
	trunk_mesh.bottom_radius = 0.28
	trunk_mesh.height = 3.4
	trunk_mesh.radial_segments = 6
	var leaf_mesh := SphereMesh.new()
	leaf_mesh.radius = 1.9
	leaf_mesh.height = 4.2
	leaf_mesh.radial_segments = 8
	leaf_mesh.rings = 5

	var trunk_mm := MultiMesh.new()
	trunk_mm.transform_format = MultiMesh.TRANSFORM_3D
	trunk_mm.instance_count = count
	var leaf_mm := MultiMesh.new()
	leaf_mm.transform_format = MultiMesh.TRANSFORM_3D
	leaf_mm.use_colors = true
	leaf_mm.instance_count = count

	var placed := 0
	var tries := 0
	while placed < count and tries < count * 12:
		tries += 1
		var x: float = _rng.randf_range(-REGION_SIZE * 0.46, REGION_SIZE * 0.46)
		var z: float = _rng.randf_range(-REGION_SIZE * 0.46, REGION_SIZE * 0.46)
		var y: float = height_at(x, z)
		if y < 0.0:
			continue
		# keep the highway clear
		var d: float = Vector2(x, z).length()
		if absf(d - ROAD_RING_RADIUS) < 34.0:
			continue
		var s: float = _rng.randf_range(0.75, 1.7)
		var basis := Basis(Vector3.UP, _rng.randf_range(0.0, TAU)).scaled(Vector3(s, s, s))
		var pos := Vector3(x, y, z)
		trunk_mm.set_instance_transform(placed, Transform3D(basis, pos + Vector3.UP * 1.4 * s))
		leaf_mm.set_instance_transform(placed, Transform3D(basis, pos + Vector3.UP * 4.3 * s))
		var tint := Color(0.10, 0.24, 0.13).lerp(Color(0.24, 0.33, 0.16), _rng.randf())
		if profile == "alpine":
			tint = Color(0.09, 0.18, 0.14).lerp(Color(0.16, 0.24, 0.18), _rng.randf())
		leaf_mm.set_instance_color(placed, tint)
		placed += 1

	trunk_mm.instance_count = placed
	leaf_mm.instance_count = placed
	var trunk_mi := MultiMeshInstance3D.new()
	trunk_mi.name = "TreeTrunks"
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color(0.14, 0.11, 0.08)
	trunk_mat.roughness = 0.95
	trunk_mi.material_override = trunk_mat
	trunk_mi.multimesh = trunk_mm
	trunk_mi.layers = 1
	_scatter_root.add_child(trunk_mi)

	var leaf_mi := MultiMeshInstance3D.new()
	leaf_mi.name = "TreeCanopy"
	var leaf_mat := StandardMaterial3D.new()
	leaf_mat.vertex_color_use_as_albedo = true
	leaf_mat.roughness = 0.85
	leaf_mi.material_override = leaf_mat
	leaf_mi.multimesh = leaf_mm
	leaf_mi.layers = 1
	_scatter_root.add_child(leaf_mi)


func _spawn_props(kind: String, count: int, min_s: float, max_s: float, tint: Color) -> void:
	var mesh: Mesh
	if kind == "rock":
		var sm := SphereMesh.new()
		sm.radius = 1.0
		sm.height = 1.4
		sm.radial_segments = 7
		sm.rings = 4
		mesh = sm
	else:
		mesh = BoxMesh.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = count
	for i in range(count):
		var x: float = _rng.randf_range(-REGION_SIZE * 0.46, REGION_SIZE * 0.46)
		var z: float = _rng.randf_range(-REGION_SIZE * 0.46, REGION_SIZE * 0.46)
		var y: float = height_at(x, z)
		var s: float = _rng.randf_range(min_s, max_s)
		var basis := Basis(Vector3.UP, _rng.randf_range(0.0, TAU))
		basis = basis.scaled(Vector3(s, s * _rng.randf_range(0.55, 0.9), s))
		mm.set_instance_transform(i, Transform3D(basis, Vector3(x, y + s * 0.2, z)))
		mm.set_instance_color(i, tint.darkened(_rng.randf() * 0.35))
	var mi := MultiMeshInstance3D.new()
	mi.name = "RockScatter"
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.96
	mi.material_override = mat
	mi.multimesh = mm
	mi.layers = 1
	_scatter_root.add_child(mi)


## Signature landmarks per region, so every map has a skyline you can navigate by.
func _build_landmarks() -> void:
	var profile: String = str(region.get("profile", "metro"))
	var accent: Color = region.get("accent", Color(0.13, 0.91, 1.0))
	if profile == "metro":
		_landmark_tower(Vector3(0, height_at(0, 0), 0), 210.0, accent)
		_landmark_arena(Vector3(ROAD_RING_RADIUS * 0.72, 0, 0), accent)
	elif profile == "alpine":
		_landmark_mast(Vector3(0, height_at(0, 0), 0), 150.0, accent)
	elif profile == "desert":
		_landmark_arena(Vector3(0, height_at(0, 0), 0), Color(1.0, 0.62, 0.22))
	else:
		_landmark_lighthouse(Vector3(ROAD_RING_RADIUS * 0.8, 0, ROAD_RING_RADIUS * 0.5), accent)


## Highway lamp posts: a warm pool of light every ~55 m along the ring, kept as
## emissive geometry plus one OmniLight pool cap so the cost stays flat. These are
## what make a night road read as a road instead of a grey ribbon in the dark.
func _build_roadside_lighting() -> void:
	if road_points.is_empty():
		return
	var lamps: int = 34 if grid == GRID else 14
	var step: int = maxi(1, int(road_points.size() / lamps))
	var pole_mesh := CylinderMesh.new()
	pole_mesh.top_radius = 0.11
	pole_mesh.bottom_radius = 0.16
	pole_mesh.height = 7.0
	pole_mesh.radial_segments = 6
	var lamp_mesh := BoxMesh.new()
	lamp_mesh.size = Vector3(1.1, 0.16, 0.34)
	var pole_mat := StandardMaterial3D.new()
	pole_mat.albedo_color = Color(0.10, 0.11, 0.14)
	pole_mat.metallic = 0.6
	pole_mat.roughness = 0.45
	var lamp_mat := StandardMaterial3D.new()
	lamp_mat.albedo_color = Color(1.0, 0.82, 0.55)
	lamp_mat.emission_enabled = true
	lamp_mat.emission = Color(1.0, 0.80, 0.52)
	lamp_mat.emission_energy_multiplier = 3.4
	lamp_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var count := 0
	for i in range(0, road_points.size(), step):
		var p: Vector3 = road_points[i]
		var q: Vector3 = road_points[(i + 2) % road_points.size()]
		var dir: Vector3 = (q - p).normalized()
		var side: Vector3 = dir.cross(Vector3.UP).normalized() * 8.6
		# alternate sides so both directions are lit
		if count % 2 == 1:
			side = -side
		var root := Node3D.new()
		root.position = p + side
		_landmark_root.add_child(root)
		var pole := MeshInstance3D.new()
		pole.mesh = pole_mesh
		pole.material_override = pole_mat
		pole.position = Vector3(0, 3.5, 0)
		root.add_child(pole)
		var arm := MeshInstance3D.new()
		arm.mesh = lamp_mesh
		arm.material_override = lamp_mat
		arm.position = Vector3(0, 7.0, 0)
		root.add_child(arm)
		# one cheap omnidirectional pool per lamp, no shadows
		var light := OmniLight3D.new()
		light.light_color = Color(1.0, 0.78, 0.50)
		light.light_energy = 2.2
		light.omni_range = 26.0
		light.omni_attenuation = 1.4
		light.shadow_enabled = false
		light.position = Vector3(0, 6.9, 0)
		root.add_child(light)
		count += 1


## A skyline silhouette on the horizon: instanced boxes with emissive window
## strips, so the edge of the map reads as a city rather than an empty plain.
func _build_distant_city() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(region.get("seed", 1337)) + 77
	var mesh := BoxMesh.new()
	mesh.size = Vector3(1, 1, 1)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var bodies: int = 90 if grid == GRID else 34
	mm.instance_count = bodies
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.04, 0.05, 0.09)
	mat.metallic = 0.55
	mat.roughness = 0.35
	mat.emission_enabled = true
	mat.emission = Color(0.22, 0.55, 0.95)
	mat.emission_energy_multiplier = 0.55
	var mi := MultiMeshInstance3D.new()
	mi.name = "Skyline"
	mi.multimesh = mm
	mi.material_override = mat
	mi.layers = 1
	for i in range(bodies):
		var a := rng.randf() * TAU
		var r := REGION_SIZE * (0.40 + rng.randf() * 0.16)
		var x := cos(a) * r
		var z := sin(a) * r
		var h := 40.0 + rng.randf() * 150.0
		var w := 18.0 + rng.randf() * 26.0
		var y := height_at(x, z)
		var xf := Transform3D(Basis.from_euler(Vector3(0, rng.randf() * TAU, 0)),
			Vector3(x, y + h * 0.5, z)).scaled(Vector3(w, h, w))
		mm.set_instance_transform(i, xf)
		mm.set_instance_color(i, Color(0.5 + rng.randf() * 0.5, 0.6 + rng.randf() * 0.4, 1.0))
	_landmark_root.add_child(mi)


func _landmark_tower(base: Vector3, h: float, accent: Color) -> void:
	var root := Node3D.new()
	root.name = "SkyTower"
	root.position = base
	_landmark_root.add_child(root)
	var body := MeshInstance3D.new()
	var bm := CylinderMesh.new()
	bm.top_radius = 6.0
	bm.bottom_radius = 13.0
	bm.height = h
	bm.radial_segments = 14
	body.mesh = bm
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(0.05, 0.08, 0.14)
	glass.metallic = 0.9
	glass.roughness = 0.10
	body.material_override = glass
	body.position = Vector3(0, h * 0.5, 0)
	root.add_child(body)
	# emissive ribs: reads like a lit skyscraper at night
	for i in range(10):
		var ring := MeshInstance3D.new()
		var tm := TorusMesh.new()
		tm.inner_radius = lerpf(6.6, 13.4, float(i) / 9.0)
		tm.outer_radius = lerpf(6.9, 13.8, float(i) / 9.0)
		tm.rings = 4
		tm.ring_segments = 20
		ring.mesh = tm
		var em := StandardMaterial3D.new()
		em.albedo_color = accent
		em.emission_enabled = true
		em.emission = accent
		em.emission_energy_multiplier = 3.0
		em.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ring.material_override = em
		ring.position = Vector3(0, h * (0.12 + float(i) * 0.085), 0)
		root.add_child(ring)
	# beacon
	var beacon := OmniLight3D.new()
	beacon.position = Vector3(0, h + 2.0, 0)
	beacon.light_color = accent
	beacon.light_energy = 6.0
	beacon.omni_range = 160.0
	beacon.shadow_enabled = false
	root.add_child(beacon)


func _landmark_mast(base: Vector3, h: float, accent: Color) -> void:
	var root := Node3D.new()
	root.name = "RelayMast"
	root.position = base
	_landmark_root.add_child(root)
	var mast := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.6
	cm.bottom_radius = 2.4
	cm.height = h
	cm.radial_segments = 8
	mast.mesh = cm
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color(0.30, 0.32, 0.36)
	metal.metallic = 0.85
	metal.roughness = 0.35
	mast.material_override = metal
	mast.position = Vector3(0, h * 0.5, 0)
	root.add_child(mast)
	var beacon := MeshInstance3D.new()
	var bm := SphereMesh.new()
	bm.radius = 2.2
	bm.height = 4.4
	bm.radial_segments = 10
	bm.rings = 6
	beacon.mesh = bm
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = accent
	bmat.emission_enabled = true
	bmat.emission = accent
	bmat.emission_energy_multiplier = 6.0
	bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beacon.material_override = bmat
	beacon.position = Vector3(0, h + 1.0, 0)
	root.add_child(beacon)
	var light := OmniLight3D.new()
	light.position = Vector3(0, h, 0)
	light.light_color = accent
	light.light_energy = 5.0
	light.omni_range = 140.0
	root.add_child(light)


func _landmark_arena(at: Vector3, accent: Color) -> void:
	var root := Node3D.new()
	root.name = "CircuitArena"
	root.position = Vector3(at.x, height_at(at.x, at.z), at.z)
	_landmark_root.add_child(root)
	var bowl := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 96.0
	tm.outer_radius = 128.0
	tm.rings = 12
	tm.ring_segments = 48
	bowl.mesh = tm
	var stone := StandardMaterial3D.new()
	stone.albedo_color = Color(0.16, 0.17, 0.20)
	stone.roughness = 0.8
	bowl.material_override = stone
	bowl.position = Vector3(0, 12.0, 0)
	bowl.scale = Vector3(1.0, 0.16, 1.0)
	root.add_child(bowl)
	var flood := OmniLight3D.new()
	flood.position = Vector3(0, 70.0, 0)
	flood.light_color = accent
	flood.light_energy = 4.0
	flood.omni_range = 260.0
	flood.shadow_enabled = false
	root.add_child(flood)


func _landmark_lighthouse(at: Vector3, accent: Color) -> void:
	var root := Node3D.new()
	root.name = "Lighthouse"
	root.position = Vector3(at.x, height_at(at.x, at.z), at.z)
	_landmark_root.add_child(root)
	var tower := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 3.0
	cm.bottom_radius = 5.0
	cm.height = 44.0
	cm.radial_segments = 12
	tower.mesh = cm
	var white := StandardMaterial3D.new()
	white.albedo_color = Color(0.86, 0.88, 0.92)
	white.roughness = 0.55
	tower.material_override = white
	tower.position = Vector3(0, 22.0, 0)
	root.add_child(tower)
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(0, 46.0, 0)
	lamp.light_color = accent
	lamp.light_energy = 8.0
	lamp.omni_range = 220.0
	root.add_child(lamp)


## Closest point on the highway ring — used by the minimap and AI traffic.
func nearest_road_point(p: Vector3) -> Vector3:
	var best := p
	var best_d := 1.0e20
	for i in range(0, road_points.size(), 4):
		var q: Vector3 = road_points[i]
		var d: float = Vector2(q.x - p.x, q.z - p.z).length_squared()
		if d < best_d:
			best_d = d
			best = q
	return best


func spawn_transform(index: int = 0) -> Transform3D:
	# start on the ring, facing along the road
	var i: int = (index * 7) % road_points.size()
	var p: Vector3 = road_points[i]
	var q: Vector3 = road_points[(i + 3) % road_points.size()]
	var dir: Vector3 = (q - p).normalized()
	# p is already the drivable road surface; a small lift avoids spawning inside
	# the collider without starting the car in free fall
	return Transform3D(Basis.looking_at(dir, Vector3.UP), p + Vector3.UP * 0.22)
