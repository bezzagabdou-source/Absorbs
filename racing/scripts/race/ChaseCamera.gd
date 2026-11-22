extends Node3D
## Chase camera with speed-based FOV, lateral lag, impact shake, nitro zoom and
## optional first-person/hood view. All motion is frame-rate independent.

var target: Node3D
var enabled: bool = true
var mode: int = 0                  # 0 chase, 1 hood
var _fov_base: float = 68.0
# A 4.4 m car needs ~9 m of boom to read as "behind" rather than "on top of";
# 6.4 m at 68 deg filled a third of the frame with bodywork.
var _boom: float = 9.6
var _height: float = 3.15
var _look_ahead: float = 11.0
var _shake: float = 0.0
var _shake_seed: float = 0.0
var _last_speed: float = 0.0
var _cam: Camera3D
var _roll: float = 0.0
var _pos_smooth: Vector3 = Vector3.ZERO
var _nitro_boost: float = 0.0
## Cinematic establishing shot: sits high and wide so the world, the road and the
## skyline all read at once. Used by the screenshot rig and the roam intro.
var showcase: bool = false
## When set (free roam), the establishing shot looks along the highway instead of
## along the car's heading, which is what puts the tarmac in frame.
var road_ahead: Vector3 = Vector3.ZERO
var road_point: Vector3 = Vector3.ZERO
var _showcase_t: float = 0.0


func _ready() -> void:
	_cam = Camera3D.new()
	_cam.fov = _fov_base
	_cam.near = 0.15
	_cam.far = 1600.0
	_cam.current = true
	add_child(_cam)
	_shake_seed = randf() * 100.0


func bind(node: Node3D) -> void:
	target = node
	if node:
		var back = node.global_transform.basis.z
		if showcase:
			_pos_smooth = node.global_position + back * 15.0 + Vector3.UP * 5.4
		else:
			_pos_smooth = node.global_position + back * _boom + Vector3.UP * _height
		_cam.global_position = _pos_smooth


## The camera node, so screens can project world points (sun flare) to 2D.
func camera() -> Camera3D:
	return _cam


func add_shake(amount: float) -> void:
	_shake = minf(_shake + amount, 2.2)


func set_nitro(on: bool) -> void:
	_nitro_boost = 1.0 if on else 0.0


func physics_tick(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	_showcase_t += delta * 0.16
	var speed: float = 0.0
	if target.has_method("speed_kmh"):
		speed = float(target.call("speed_kmh"))
	var basis: Basis = target.global_transform.basis
	var forward = -basis.z
	var right = basis.x
	if mode == 1:
		var hood = target.global_position + forward * 1.45 + Vector3.UP * 1.12
		_cam.global_position = hood
		_cam.look_at(target.global_position + forward * 30.0 + Vector3.UP * 0.7, Vector3.UP)
		_cam.fov = _fov_base + clampf(speed / 22.0, 0.0, 12.0) + _nitro_boost * 6.0
		_apply_shake(delta, 0.35)
		return
	if showcase:
		# Establishing shot. The old version orbited on a 15 m boom at 6.2 m up,
		# which in practice framed a wall of shadowed ground with the car in the
		# middle and no road visible: the ring is 16 m wide, so a camera 15 m to
		# the side is already off the tarmac. This sits low and behind on the
		# carriageway axis and drifts in slowly, so the road reads as a road.
		# Framing rule: the carriageway is 16 m wide and the car sits on its centre,
		# so the camera has to stay near that centreline and look DOWN THE ROAD. The
		# previous boom sat 15 m to the side, which put the lens over open ground with
		# the tarmac out of frame; that is what "the road is invisible" actually was.
		var centre: Vector3 = target.global_position
		var look_dir: Vector3 = forward
		if road_ahead.length_squared() > 0.01:
			look_dir = road_ahead.normalized()
		# Tight and low. A 11 m boom at 3 m up looks along the horizon and the
		# carriageway — 16 m of asphalt directly under the car — never enters the
		# frame; everything below the horizon line is then read as "no road".
		# Sitting 6.5 m back and 2.2 m up puts the tarmac in the bottom third and
		# leaves the road ahead filling the middle of the frame.
		var sway: float = sin(_showcase_t * 2.0) * 0.25
		var cam_pos: Vector3 = centre - look_dir * 6.5 + Vector3.UP * 2.2 + right * sway
		_pos_smooth = _pos_smooth.lerp(cam_pos, clampf(delta * 2.4, 0.0, 1.0))
		_cam.global_position = _pos_smooth
		_cam.look_at(centre + look_dir * 9.0 - Vector3.UP * 1.9, Vector3.UP)
		_cam.fov = lerpf(_cam.fov, 64.0, delta * 2.0)
		return
	var speed_norm = clampf(speed / 340.0, 0.0, 1.0)
	var desired_boom = _boom + speed_norm * 1.6 + _nitro_boost * 1.9
	var desired_height = _height + speed_norm * 0.28
	var desired: Vector3 = target.global_position - forward * desired_boom + Vector3.UP * desired_height
	_pos_smooth = _pos_smooth.lerp(desired, clampf(delta * (7.0 - speed_norm * 2.6), 0.0, 1.0))
	var look: Vector3 = target.global_position + forward * (_look_ahead + speed_norm * 12.0) + Vector3.UP * 1.1
	_cam.global_position = _pos_smooth
	var up = Vector3.UP
	_roll = lerpf(_roll, -right.dot(Vector3.UP) * 0.0, delta * 3.0)
	_cam.look_at(look, up)
	_cam.rotate_object_local(Vector3.FORWARD, -_roll)
	_cam.fov = lerpf(_cam.fov, _fov_base + speed_norm * 20.0 + _nitro_boost * 8.0, delta * 4.0)
	_apply_shake(delta, 1.0)
	_nitro_boost = maxf(0.0, _nitro_boost - delta * 0.7)


func _apply_shake(delta: float, scale: float) -> void:
	if not bool(SettingsStore.get_value("camera_shake", true)):
		_shake = 0.0
		return
	if _shake <= 0.001:
		return
	var t = float(Time.get_ticks_msec()) * 0.001 + _shake_seed
	var offset = Vector3(sin(t * 47.0), sin(t * 61.0 + 1.7), 0.0) * _shake * 0.06 * scale
	_cam.global_position += offset
	_shake = maxf(0.0, _shake - delta * 2.4)


func current_camera() -> Camera3D:
	return _cam


func cycle_mode() -> void:
	mode = 1 - mode
