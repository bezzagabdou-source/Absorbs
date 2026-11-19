extends RefCounted
## Deterministic track path generation + cached track data.
## A track is a closed loop sampled from an analytic polar curve with harmonic
## radius modulation plus an elevation profile.

class TrackData:
	var id = ""
	var name = ""
	var points = PackedVector3Array()
	var tangents = PackedVector3Array()
	var rights = PackedVector3Array()
	var ups = PackedVector3Array()
	var widths = PackedFloat32Array()
	var cumulative = PackedFloat32Array()
	var total_length = 0.0
	var segments = 0
	var start_transform = Transform3D.IDENTITY
	var min_y = 0.0
	var max_y = 0.0

	func sample_distance(d: float) -> Dictionary:
		var dd = fposmod(d, total_length)
		var lo = 0
		var hi = segments
		while lo < hi:
			var mid = int((lo + hi) / 2.0)
			if cumulative[mid] < dd:
				lo = mid + 1
			else:
				hi = mid
		var i = clampi(lo, 1, segments)
		var span = maxf(0.0001, cumulative[i] - cumulative[i - 1])
		var t = (dd - cumulative[i - 1]) / span
		return {
			"pos": points[i - 1].lerp(points[i], t),
			"tan": tangents[i - 1].lerp(tangents[i], t).normalized(),
			"right": rights[i - 1].lerp(rights[i], t).normalized(),
			"width": lerpf(widths[i - 1], widths[i], t),
			"index": i,
		}

	func project(p: Vector3, hint_index: int = -1) -> Dictionary:
		var best = 1.0e20
		var best_i = 0
		var best_t = 0.0
		var start = 0
		var end = segments
		if hint_index >= 0:
			start = maxi(0, hint_index - 30)
			end = mini(segments, hint_index + 30)
		for i in range(start, end):
			var a = points[i]
			var b = points[(i + 1) % points.size()]
			var ab: Vector3 = b - a
			var t: float = clampf((p - a).dot(ab) / maxf(0.0001, ab.length_squared()), 0.0, 1.0)
			var q = a + ab * t
			var d = p.distance_squared_to(q)
			if d < best:
				best = d
				best_i = i
				best_t = t
		var i2 = best_i
		var q2 = points[i2].lerp(points[(i2 + 1) % points.size()], best_t)
		var along = cumulative[i2] + (cumulative[i2 + 1] - cumulative[i2]) * best_t
		return {
			"index": i2,
			"along": along,
			"lateral": (p - q2).dot(rights[i2]),
			"point": q2,
			"distance": sqrt(best),
		}


static var cache_store: Dictionary = {}


static func build_path(gen: Dictionary) -> TrackData:
	var td = TrackData.new()
	var n = 1200
	var radius: float = gen.get("radius", 320.0)
	var harm: Array = gen.get("harm", [])
	var hills: float = gen.get("hills", 8.0)
	var width: float = gen.get("width", 16.0)
	var rng = RandomNumberGenerator.new()
	rng.seed = int(gen.get("seed", 1))
	td.segments = n
	td.points.resize(n + 1)
	td.tangents.resize(n + 1)
	td.rights.resize(n + 1)
	td.ups.resize(n + 1)
	td.widths.resize(n + 1)
	td.cumulative.resize(n + 2)
	var hill_phase = rng.randf() * TAU
	for i in range(n + 1):
		var t = float(i) / float(n)
		var a = t * TAU
		var r = radius
		for h in harm:
			r += radius * float(h[1]) * cos(float(h[0]) * a + float(h[2]))
		r *= 1.0 + 0.06 * sin(a + 0.7)
		var y = 0.0
		if hills > 0.0:
			y = hills * (0.55 * sin(a * 2.0 + hill_phase) + 0.3 * sin(a * 3.0 + hill_phase * 2.0) \
				+ 0.15 * sin(a * 5.0 + hill_phase * 3.0))
		td.points[i] = Vector3(cos(a) * r, y, sin(a) * r)
		td.widths[i] = width * (1.0 + 0.10 * cos(a * 3.0 + hill_phase))
	for i in range(n + 1):
		var prev = td.points[(i - 1 + n) % n]
		var next = td.points[(i + 1) % n]
		var tan = (next - prev).normalized()
		var right = tan.cross(Vector3.UP).normalized()
		td.tangents[i] = tan
		td.rights[i] = right
		td.ups[i] = right.cross(tan).normalized()
	var acc = 0.0
	td.cumulative[0] = 0.0
	for i in range(1, n + 1):
		acc += td.points[i].distance_to(td.points[i - 1])
		td.cumulative[i] = acc
	td.cumulative[n + 1] = acc
	td.total_length = acc
	var st = Transform3D()
	st.origin = td.points[0] + Vector3.UP * 0.05
	st.basis = Basis.looking_at(td.tangents[0], Vector3.UP)
	td.start_transform = st
	td.min_y = 1.0e9
	td.max_y = -1.0e9
	for p in td.points:
		td.min_y = minf(td.min_y, p.y)
		td.max_y = maxf(td.max_y, p.y)
	return td


static func for_track(track: Dictionary) -> TrackData:
	var id = str(track.get("id", "track"))
	if cache_store.has(id):
		return cache_store[id]
	var td = build_path(track.get("gen", {}))
	td.id = id
	td.name = str(track.get("name", id))
	cache_store[id] = td
	return td


static func clear_cache() -> void:
	cache_store.clear()
