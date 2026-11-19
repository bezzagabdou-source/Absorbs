class_name CameraRig
extends Node3D
## Third-person spring-arm camera with touch look, aim FOV and shoulder swap.

var target: Node3D
var input: Node
var spring: SpringArm3D
var camera: Camera3D
var yaw: float = 0.0
var pitch: float = -0.22
var aiming: bool = false
var shoulder: int = 1
var _shake: float = 0.0

func setup(p_target: Node3D, p_input: Node) -> void:
	target = p_target
	input = p_input
	spring = SpringArm3D.new()
	spring.spring_length = 4.6
	spring.margin = 0.35
	add_child(spring)
	camera = Camera3D.new()
	camera.fov = 68.0
	camera.near = 0.08
	camera.far = 700.0
	spring.add_child(camera)
	camera.position = Vector3(0.8, 0.25, 0)

func _process(delta: float) -> void:
	if target == null or camera == null:
		return
	var look: Vector2 = input.consume_look()
	yaw -= look.x * 0.004
	pitch = clampf(pitch - look.y * 0.003, -1.15, 0.75)
	global_position = target.global_position + Vector3(0, 1.55, 0)
	rotation = Vector3(pitch, yaw, 0.0)
	camera.position.x = lerpf(camera.position.x, 0.8 * float(shoulder), delta * 8.0)
	var wanted := 68.0 if not aiming else 48.0
	camera.fov = lerpf(camera.fov, wanted, delta * 8.0)
	spring.spring_length = lerpf(spring.spring_length, 3.2 if aiming else 4.6, delta * 6.0)
	if _shake > 0.0:
		_shake = maxf(0.0, _shake - delta * 3.0)
		camera.rotation.z = sin(Time.get_ticks_msec() * 0.05) * _shake * 0.03

func shake(amount: float) -> void:
	_shake = clampf(_shake + amount, 0.0, 1.5)

func aim_origin() -> Vector3:
	return camera.global_position

func aim_direction() -> Vector3:
	return -camera.global_transform.basis.z.normalized()
