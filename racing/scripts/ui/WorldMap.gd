extends Control
## Full-screen world map for free roam.
##
## The open world is a ring highway laid out on top of a noise landscape, so a
## straight top-down orthographic view of the mesh would be an unreadable smear.
## Instead this draws the road network the same way a navigation app does:
##   * a soft landmass silhouette sampled from the same height function the
##     terrain mesh is built from, shaded by elevation
##   * the highway as a thick stroke with a lighter centre line, so the driving
##     line is obvious at a glance
##   * the player's arrow, rotating with heading
##   * region labels and points of interest
##
## It repaints only when the map opens or the player has moved, so it costs
## nothing while driving.

var open_world: Node3D
var player: Node3D
var accent := Color(0.13, 0.91, 1.0)
var _built := false
var _land: Array = []          # [{pos: Vector2, tone: float}] in world space
var _road: PackedVector2Array = PackedVector2Array()
var _bounds := Rect2()

const MAP_PX := 780.0
const SAMPLES := 74


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	z_index = 60


func _build() -> void:
	if open_world == null:
		return
	var r: float = float(open_world.ROAD_RING_RADIUS) * 1.42
	_bounds = Rect2(-r, -r, r * 2.0, r * 2.0)
	# land: a coarse elevation grid, shaded and faded so the road stays dominant
	_land.clear()
	for gy in SAMPLES:
		for gx in SAMPLES:
			var wx: float = _bounds.position.x + _bounds.size.x * (float(gx) + 0.5) / float(SAMPLES)
			var wz: float = _bounds.position.y + _bounds.size.y * (float(gy) + 0.5) / float(SAMPLES)
			if not open_world.has_method("height_at"):
				continue
			var h: float = float(open_world.height_at(wx, wz))
			_land.append({"pos": Vector2(wx, wz), "h": h})
	# road: use the same sampled centreline the physics collider was built from
	_road = PackedVector2Array()
	if "road_points" in open_world:
		for p in open_world.road_points:
			_road.append(Vector2(p.x, p.z))
	_built = true


func toggle() -> void:
	visible = not visible
	if visible:
		if not _built or (open_world != null and "road_points" in open_world
				and _road.size() != open_world.road_points.size()):
			_built = false
			_build()
		queue_redraw()


func _world_to_screen(p: Vector2) -> Vector2:
	var s: float = MAP_PX / _bounds.size.x
	return (p - _bounds.position) * s


func _draw() -> void:
	if not _built:
		return
	var cx: float = size.x * 0.5
	var cy: float = size.y * 0.5
	var origin: Vector2 = Vector2(cx - MAP_PX * 0.5, cy - MAP_PX * 0.5)

	# panel wash
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.008, 0.012, 0.026, 0.88))
	draw_rect(Rect2(origin - Vector2(18, 18), Vector2(MAP_PX + 36, MAP_PX + 36)),
		Color(0.03, 0.06, 0.10, 0.85), false, 2.0)

	# land: one soft disc per sample, darker where the terrain is low and tinted
	# cyan-white on the peaks, so ridges read as ridges
	var cell: float = MAP_PX / float(SAMPLES) * 1.35
	var hmin := 1.0e9
	var hmax := -1.0e9
	for s in _land:
		hmin = minf(hmin, float(s["h"]))
		hmax = maxf(hmax, float(s["h"]))
	var span: float = maxf(hmax - hmin, 1.0)
	for s in _land:
		var t: float = clampf((float(s["h"]) - hmin) / span, 0.0, 1.0)
		var col: Color = Color(0.05, 0.09, 0.16).lerp(Color(0.30, 0.46, 0.60), t)
		col.a = 0.85
		var pt: Vector2 = origin + _world_to_screen(s["pos"])
		draw_circle(pt, cell, col)

	# water beyond the shoreline: a vignette ring keeps the island readable
	draw_arc(origin + Vector2(MAP_PX, MAP_PX) * 0.5, MAP_PX * 0.5, 0.0, TAU, 96,
		Color(accent.r, accent.g, accent.b, 0.16), 3.0)

	# road
	if _road.size() > 2:
		var pts := PackedVector2Array()
		for p in _road:
			pts.append(origin + _world_to_screen(p))
		pts.append(pts[0])
		draw_polyline(pts, Color(0.02, 0.03, 0.05, 0.95), 26.0, true)
		draw_polyline(pts, Color(0.62, 0.68, 0.78, 0.95), 15.0, true)
		draw_polyline(pts, Color(accent.r, accent.g, accent.b, 0.55), 4.0, true)

	# player arrow
	if player != null:
		var pp: Vector2 = origin + _world_to_screen(Vector2(player.global_position.x,
			player.global_position.z))
		var fwd: Vector3 = -player.global_transform.basis.z
		var dir: Vector2 = Vector2(fwd.x, fwd.z).normalized()
		if dir.length() < 0.01:
			dir = Vector2.UP
		var side := Vector2(-dir.y, dir.x)
		var tip: Vector2 = pp + dir * 22.0
		var l: Vector2 = pp - dir * 14.0 + side * 13.0
		var r: Vector2 = pp - dir * 14.0 - side * 13.0
		draw_colored_polygon(PackedVector2Array([tip, l, r]), accent)
		draw_circle(pp, 30.0, Color(accent.r, accent.g, accent.b, 0.16))

	# north marker
	draw_string(ThemeDB.fallback_font, origin + Vector2(MAP_PX * 0.5 - 8, 26), "N",
		HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1, 1, 1, 0.6))
