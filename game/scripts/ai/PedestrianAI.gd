class_name PedestrianAI
extends CharacterBody3D
## Low-cost pedestrian with a waypoint stub and flee/ragdoll reactions.

var target: Vector3
var speed: float = 1.6
var panic: bool = false
var dead: bool = false
var _mesh: MeshInstance3D
var _rng := RandomNumberGenerator.new()

func setup(p_target: Vector3, seed_value: int) -> void:
	_rng.seed = seed_value
	target = p_target
	_build()
	var shape := CollisionShape3D.new()
	var c := CapsuleShape3D.new()
	c.radius = 0.3
	c.height = 1.7
	shape.shape = c
	shape.position.y = 0.85
	add_child(shape)
	collision_layer = 2
	collision_mask = 1

func _build() -> void:
	_mesh = MeshInstance3D.new()
	var m := CapsuleMesh.new()
	m.radius = 0.3
	m.height = 1.7
	_mesh.mesh = m
	_mesh.position.y = 0.85
	var mat := StandardMaterial3D.new()
	var palette := [Color(0.72, 0.35, 0.28), Color(0.26, 0.44, 0.62), Color(0.44, 0.38, 0.58), Color(0.61, 0.55, 0.36), Color(0.20, 0.50, 0.42)]
	mat.albedo_color = palette[_rng.randi_range(0, palette.size() - 1)]
	_mesh.material_override = mat
	add_child(_mesh)

func _physics_process(delta: float) -> void:
	if dead:
		return
	var to := target - global_position
	to.y = 0
	if to.length() < 2.0:
		var a := _rng.randf() * TAU
		target = global_position + Vector3(cos(a), 0, sin(a)) * _rng.randf_range(12, 45)
	var dir := to.normalized()
	var s := speed * (2.4 if panic else 1.0)
	velocity.x = lerpf(velocity.x, dir.x * s, delta * 5.0)
	velocity.z = lerpf(velocity.z, dir.z * s, delta * 5.0)
	velocity.y -= 18.0 * delta
	move_and_slide()
	rotation.y = lerp_angle(rotation.y, atan2(dir.x, dir.z), delta * 6.0)

func take_damage(_amount: float, _part: String = "torso") -> void:
	dead = true
	_mesh.rotation.x = PI * 0.5
	_mesh.position.y = 0.35
	velocity = Vector3.ZERO
	set_physics_process(false)

func scare() -> void:
	panic = true
	var a := _rng.randf() * TAU
	target = global_position + Vector3(cos(a), 0, sin(a)) * 60.0
