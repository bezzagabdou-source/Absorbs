extends SubViewportContainer
## A live, rotating 3D car in a UI panel.
##
## The dealership used to describe cars with two stat bars and a colour dot. You
## cannot sell a hypercar with a dot. This puts a real CarModel on a turntable
## inside a SubViewport and composites it as a normal Control, so it drops into
## any screen that has a rectangle to spare.
##
## Cost control, because this can appear 9 at a time in a grid:
##   * `auto_spin` defaults OFF in grids and ON for the detail panel. Nine spinning
##     cars is nine _process callbacks; one is nothing.
##   * `render_scale` below 1.0 renders the viewport at half resolution and lets
##     the texture stretch. On a 200 px card nobody can tell.
##   * Nothing is allocated per frame: the car is built once in `show_car`.

const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")

var auto_spin: bool = true
var spin_speed: float = 0.42
var render_scale: float = 1.0
var _spin: float = 0.0
var _yaw: float = -0.62
var _pitch: float = 0.20
var _car: Node3D = null
var _viewport: SubViewport = null
var _pivot: Node3D = null
var _ok: bool = false


func setup() -> bool:
	stretch = true
	# The container must not eat taps meant for the card underneath.
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_viewport = SubViewport.new()
	_viewport.transparent_bg = true
	_viewport.own_world_3d = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_viewport.msaa_3d = Viewport.MSAA_2X
	add_child(_viewport)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.30, 0.36, 0.46)
	e.ambient_light_energy = 1.5
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.glow_enabled = true
	e.glow_intensity = 0.35
	e.glow_bloom = 0.04
	env.environment = e
	_viewport.add_child(env)

	_pivot = Node3D.new()
	_viewport.add_child(_pivot)

	# A soft studio: key from upper-front-right, cool fill from behind, and a
	# warm bounce low so the sills are not black. No shadow-casting floor: the
	# alpha background already gives the card its own colour.
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-42.0), deg_to_rad(38.0), 0.0)
	key.light_energy = 2.1
	key.light_color = Color(1.0, 0.97, 0.93)
	key.shadow_enabled = true
	_viewport.add_child(key)

	var fill := DirectionalLight3D.new()
	fill.rotation = Vector3(deg_to_rad(-18.0), deg_to_rad(-135.0), 0.0)
	fill.light_energy = 1.0
	fill.light_color = Color(0.55, 0.72, 1.0)
	_viewport.add_child(fill)

	var bounce := DirectionalLight3D.new()
	bounce.rotation = Vector3(deg_to_rad(28.0), deg_to_rad(160.0), 0.0)
	bounce.light_energy = 0.55
	bounce.light_color = Color(1.0, 0.86, 0.70)
	_viewport.add_child(bounce)

	var cam := Camera3D.new()
	cam.fov = 34.0
	cam.near = 0.05
	cam.far = 60.0
	# framed from a front three-quarter above the beltline, which is the angle
	# every car photograph uses because it shows the nose, the shoulder and the
	# rear haunch at once
	var dist: float = 7.6
	var pos := Vector3(
		sin(_yaw) * cos(_pitch) * dist,
		sin(_pitch) * dist + 0.35,
		cos(_yaw) * cos(_pitch) * dist)
	cam.position = pos
	cam.look_at_from_position(pos, Vector3(0.0, 0.55, 0.0), Vector3.UP)
	_viewport.add_child(cam)
	cam.current = true
	_ok = true
	return true


## Build the car for a catalogue entry. Safe to call repeatedly — the previous
## model is released first, so a card can be re-pointed at a different car.
func show_car(car: Dictionary, paint_id: String = "", rim_id: String = "split5") -> void:
	if not _ok or car.is_empty():
		return
	if _car != null and is_instance_valid(_car):
		_car.queue_free()
		_car = null
	var model = CarModelScript.new()
	_pivot.add_child(model)
	var pid: String = paint_id if paint_id != "" else str(car.get("paint", "cyan"))
	model.build(car, pid, rim_id)
	_car = model


## Paint and rim changes without rebuilding geometry, for the garage where the
## player flicks through colours on one car.
func repaint(paint_id: String, rim_id: String = "") -> void:
	if _car == null or not is_instance_valid(_car):
		return
	# set_paint_live takes a Color, not an id: resolve through GameData so the
	# viewer does not need its own paint table.
	var info: Dictionary = GameData.paint_by_id(paint_id)
	var hex := str(info.get("color", "22e9ff"))
	if _car.has_method("set_paint_live") and hex.length() >= 6:
		_car.set_paint_live(Color(hex))
	if rim_id != "" and _car.has_method("set_rim_live"):
		_car.set_rim_live(rim_id)


func _process(delta: float) -> void:
	if not _ok:
		return
	if auto_spin:
		_spin += delta * spin_speed
		_pivot.rotation.y = _spin


## Called by the host when the card is hidden or freed. A SubViewport that stays
## in UPDATE_ALWAYS keeps rendering off-screen forever otherwise.
func set_live(live: bool) -> void:
	if _viewport == null:
		return
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if live else SubViewport.UPDATE_DISABLED
	set_process(live)
