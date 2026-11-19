extends Node3D
## Chase camera with speed-based FOV, lateral lag, impact shake, nitro zoom and
## optional first-person/hood view. All motion is frame-rate independent.

var target: Node3D
var enabled := true
var mode := 0                  # 0 chase, 1 hood
var _fov_base := 68.0
var _boom := 6.4
var _height := 2.35
var _look_ahead := 8.0
var _shake := 0.0
var _shake_seed := 0.0
var _last_speed := 0.0
var _cam: Camera3D
var _roll := 0.0
var _pos_smooth := Vector3.ZERO
var _nitro_boost := 0.0


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
		var back := node.global_transform.basis.z
		_pos_smooth = node.global_position + back * _boom + Vector3.UP * _height
		_cam.global_position = _pos_smooth


func add_shake(amount: float) -> void:
	_shake = minf(_shake + amount, 2.2)


func set_nitro(on: bool) -> void:
	_nitro_boost = 1.0 if on else 0.0


func physics_tick(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var speed: float = 0.0
	if target.has_method("speed_kmh"):
		speed = float(target.call("speed_kmh"))
	var basis: Basis = target.global_transform.basis
	var forward := -basis.z
	var right := basis.x
	if mode == 1:
		var hood = target.global_position + forward * 1.2 + Vector3.UP * 1.05
		_cam.global_position = hood
		_cam.look_at(target.global_position + forward * 30.0 + Vector3.UP * 0.7, Vector3.UP)
		_cam.fov = _fov_base + clampf(speed / 22.0, 0.0, 12.0) + _nitro_boost * 6.0
		_apply_shake(delta, 0.35)
		return
	var speed_norm := clampf(speed / 340.0, 0.0, 1.0)
	var desired_boom = _boom + speed_norm * 1.6 + _nitro_boost * 1.9
	var desired_height = _height + speed_norm * 0.28
	var desired: Vector3 = target.global_position - forward * desired_boom + Vector3.UP * desired_height
	_pos_smooth = _pos_smooth.lerp(desired, clampf(delta * (7.0 - speed_norm * 2.6), 0.0, 1.0))
	var look: Vector3 = target.global_position + forward * (_look_ahead + speed_norm * 12.0) + Vector3.UP * 1.1
	_cam.global_position = _pos_smooth
	var up := Vector3.UP
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
