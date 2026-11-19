class_name PlayerController
extends CharacterBody3D
## On-foot third-person controller. Simple humanoid built from primitives.

signal died

var input: InputManager
var bus: EventBus
var camera_rig: CameraRig
var health: float = 100.0
var armour: float = 0.0
var stamina: float = 100.0
var money: int = 500
var in_vehicle: bool = false
var current_vehicle: Node3D = null
var weapon_system: Node = null
var _speed: float = 5.6
var _gravity: float = 20.0
var _jump: float = 6.6
var _limbs: Array[MeshInstance3D] = []
var _walk_time: float = 0.0
var _hurt_cooldown: float = 0.0
var _skills: Dictionary = {"strength": 1, "speed": 1, "accuracy": 1, "driving": 1}

func setup(p_input: InputManager, p_bus: EventBus) -> void:
	input = p_input
	bus = p_bus
	_build_body()
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.38
	capsule.height = 1.8
	shape.shape = capsule
	shape.position.y = 0.9
	add_child(shape)
	floor_snap_length = 0.4
	slide_on_ceiling = true
	if bus != null:
		bus.health_changed.connect(_on_health_request)

func _build_body() -> void:
	var torso := MeshInstance3D.new()
	var tcapsule := CapsuleShape3D.new()
	tcapsule.radius = 0.32
	tcapsule.height = 0.85
	var tmesh := CylinderMesh.new()
	tmesh.top_radius = 0.30
	tmesh.bottom_radius = 0.36
	tmesh.height = 0.9
	torso.mesh = tmesh
	torso.position.y = 1.2
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.16, 0.44, 0.50)
	torso.material_override = mat
	add_child(torso)
	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.22
	head.mesh = sphere
	head.position.y = 1.84
	var skin := StandardMaterial3D.new()
	skin.albedo_color = Color(0.74, 0.56, 0.42)
	head.material_override = skin
	add_child(head)
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.10, 0.12, 0.16)
	for i in range(4):
		var limb := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.16, 0.72, 0.16)
		limb.mesh = box
		limb.material_override = dark
		var side := -1.0 if i % 2 == 0 else 1.0
		limb.position = Vector3(side * 0.18, 0.38 if i < 2 else 1.22, 0)
		add_child(limb)
		_limbs.append(limb)

func _physics_process(delta: float) -> void:
	if in_vehicle or input == null:
		return
	_hurt_cooldown = maxf(0.0, _hurt_cooldown - delta)
	var mv := input.get_move()
	var cam_yaw: float = camera_rig.yaw if camera_rig != null else 0.0
	var forward := Vector3(sin(cam_yaw), 0, cos(cam_yaw)).normalized()
	var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw)).normalized()
	var want := (forward * mv.y + right * mv.x)
	var sprint := input.pressed("sprint") and mv.length() > 0.6 and stamina > 5.0
	var speed := _speed * (1.0 + 0.08 * float(_skills["speed"]))
	if sprint:
		speed *= 1.65
		stamina = maxf(0.0, stamina - delta * 16.0)
	else:
		stamina = minf(100.0, stamina + delta * 11.0)
	if is_on_floor() and input.pressed("jump"):
		velocity.y = _jump
	velocity.x = lerpf(velocity.x, want.x * speed, delta * 12.0)
	velocity.z = lerpf(velocity.z, want.z * speed, delta * 12.0)
	velocity.y -= _gravity * delta
	move_and_slide()
	if want.length_squared() > 0.02:
		var look_dir := want.normalized()
		rotation.y = lerp_angle(rotation.y, atan2(look_dir.x, look_dir.z), delta * 12.0)
		_walk_time += delta * (12.0 if sprint else 8.0)
		for i in range(_limbs.size()):
			var phase := _walk_time + float(i % 2) * PI
			_limbs[i].rotation.x = sin(phase) * 0.55
	else:
		for l in _limbs:
			l.rotation.x = lerpf(l.rotation.x, 0.0, delta * 8.0)

func take_damage(amount: float, part: String = "torso") -> void:
	if _hurt_cooldown > 0.0:
		return
	_hurt_cooldown = 0.12
	var mult := 1.0
	if part == "head":
		mult = 2.3
	elif part == "limb":
		mult = 0.6
	var dmg := amount * mult
	if armour > 0.0:
		var absorbed := minf(armour, dmg * 0.7)
		armour -= absorbed
		dmg -= absorbed
	health -= dmg
	if bus != null:
		bus.health_changed.emit(health, armour)
	if camera_rig != null:
		camera_rig.shake(0.4)
	if health <= 0.0:
		died.emit()
		if bus != null:
			bus.player_died.emit()

func heal(amount: float) -> void:
	health = clampf(health + amount, 0.0, 100.0)
	if bus != null:
		bus.health_changed.emit(health, armour)

func add_armour(amount: float) -> void:
	armour = clampf(armour + amount, 0.0, 100.0)
	if bus != null:
		bus.health_changed.emit(health, armour)

func add_money(amount: int) -> void:
	money += amount
	if bus != null:
		bus.money_changed.emit(money)

func spend(amount: int) -> bool:
	if money < amount:
		return false
	money -= amount
	if bus != null:
		bus.money_changed.emit(money)
	return true

func set_in_vehicle(v: bool, vehicle: Node3D) -> void:
	in_vehicle = v
	current_vehicle = vehicle
	visible = not v
	set_physics_process(not v)
	if bus != null:
		bus.vehicle_state_changed.emit(v)

func _on_health_request(hp: float, ar: float) -> void:
	health = hp
	armour = ar
