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
## Sweep the camera around the car instead of rotating the car itself. A
## turntable turns the model, which means the lighting changes as it goes and
## the far side is always facing away; orbiting keeps the key on the car and
## reveals the profile, the rear three-quarter and the head-on view.
var orbit: bool = false
var spin_speed: float = 0.42
var render_scale: float = 1.0
var _spin: float = 0.0
var _yaw: float = -0.62
var _pitch: float = 0.20
var _car: Node3D = null
var _cam: Camera3D = null
var _cam_dist: float = 6.6
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
	e.ambient_light_color = Color(0.26, 0.32, 0.42)
	e.ambient_light_energy = 0.70
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.tonemap_white = 1.6
	# Glow off. It was bleeding the whole body into a haze, which is most of the
	# reason the cars looked washed out and shapeless rather than like painted
	# metal. The panel already supplies the "showroom" light.
	e.glow_enabled = false
	env.environment = e
	_viewport.add_child(env)

	_pivot = Node3D.new()
	_viewport.add_child(_pivot)

	# A shadow-catcher floor. Without it the key light has nothing to cast onto,
	# and a car with no contact shadow reads as pasted on a card rather than
	# standing somewhere. It is unshaded and nearly transparent, so only the
	# shadow darkens the car's surroundings and the panel colour shows through.
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(14.0, 14.0)
	var floor_mat := StandardMaterial3D.new()
	floor_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	floor_mat.albedo_color = Color(0.0, 0.0, 0.0, 0.0)
	floor_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var floor := MeshInstance3D.new()
	floor.mesh = floor_mesh
	floor.material_override = floor_mat
	floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	floor.position = Vector3(0.0, -0.02, 0.0)
	_viewport.add_child(floor)

	# A soft studio: key from upper-front-right, cool fill from behind, and a
	# warm bounce low so the sills are not black. No shadow-casting floor: the
	# alpha background already gives the card its own colour.
	var key := DirectionalLight3D.new()
	key.rotation = Vector3(deg_to_rad(-42.0), deg_to_rad(38.0), 0.0)
	# Energy budget, derived rather than tuned by eye: the paint's linear albedo
	# is ~(0.13, 0.91, 1.0) for cyan, and anything above ~1.0 tonemaps to white.
	# At key 2.9 + fill 0.55 + bounce 0.35 the green and blue channels landed at
	# 1.9 and 2.1, i.e. 2-4x over range, which is why every car rendered as a
	# pale blob regardless of the paint that was selected. 1.15 + 0.35 + 0.18
	# gives a brightest linear channel near 0.85: colour survives, and the
	# falloff across the body still shades the form.
	key.light_energy = 1.55
	key.light_color = Color(1.0, 0.97, 0.93)
	key.shadow_enabled = true
	_viewport.add_child(key)

	var fill := DirectionalLight3D.new()
	fill.rotation = Vector3(deg_to_rad(-18.0), deg_to_rad(-135.0), 0.0)
	fill.light_energy = 0.50
	fill.light_color = Color(0.55, 0.72, 1.0)
	_viewport.add_child(fill)

	var bounce := DirectionalLight3D.new()
	bounce.rotation = Vector3(deg_to_rad(28.0), deg_to_rad(160.0), 0.0)
	bounce.light_energy = 0.30
	bounce.light_color = Color(1.0, 0.86, 0.70)
	_viewport.add_child(bounce)

	var cam := Camera3D.new()
	cam.fov = 30.0
	cam.near = 0.05
	cam.far = 60.0
	# framed from a front three-quarter above the beltline, which is the angle
	# every car photograph uses because it shows the nose, the shoulder and the
	# rear haunch at once
	# 5.9 m, not 7.6: a 4.6 m car at 30 degrees fills about 80 percent of the
	# frame width, which is how a car is cropped in a press photo. The previous
	# distance left so much headroom that the model read as a small toy.
	var dist: float = _cam_dist
	var pos := Vector3(
		sin(_yaw) * cos(_pitch) * dist,
		sin(_pitch) * dist + 0.30,
		cos(_yaw) * cos(_pitch) * dist)
	cam.position = pos
	# Aim at 0.62 rather than 0.55 so the car sits on the optical centre with a
	# touch of space beneath, instead of floating in the upper half of the card.
	cam.look_at_from_position(pos, Vector3(0.0, 0.62, 0.0), Vector3.UP)
	_viewport.add_child(cam)
	cam.current = true
	_cam = cam
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
		if orbit and _cam != null:
			var oy: float = _yaw + _spin
			var d: float = _cam_dist
			_cam.position = Vector3(
				sin(oy) * cos(_pitch) * d,
				sin(_pitch) * d + 0.30,
				cos(oy) * cos(_pitch) * d)
			_cam.look_at_from_position(_cam.position, Vector3(0.0, 0.62, 0.0), Vector3.UP)
		else:
			_pivot.rotation.y = _spin


## Called by the host when the card is hidden or freed. A SubViewport that stays
## in UPDATE_ALWAYS keeps rendering off-screen forever otherwise.
func set_live(live: bool) -> void:
	if _viewport == null:
		return
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if live else SubViewport.UPDATE_DISABLED
	set_process(live)
