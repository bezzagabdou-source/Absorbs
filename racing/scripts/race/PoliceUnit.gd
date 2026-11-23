extends Node3D
## One pursuit vehicle. Owns a CarController + procedural CarModel painted like
## a patrol car, plus a flashing roof bar.
##
## The controller is driven directly from here (its keyboard reader is disabled),
## so a police car accelerates, brakes and slides through exactly the same
## physics as the player instead of teleporting along a spline.

const CarControllerScript = preload("res://scripts/vehicle/CarController.gd")
const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")

const MASS := 1650.0

var car                          ## CarController
var model                        ## CarModel
var _light_bar: Node3D
var _flash: float = 0.0
var _steer_smooth: float = 0.0
var _speed_limit: float = 62.0


func spawn(pos: Vector3, difficulty: float = 1.0) -> void:
	_speed_limit = 55.0 + difficulty * 8.0
	car = CarControllerScript.new()
	car.name = "Chassis"
	car.collision_layer = 8
	car.collision_mask = 1
	add_child(car)
	car.apply_physics({
		"top_speed_ms": _speed_limit,
		"accel": 14.5 + difficulty * 1.2,
		"grip": 0.93,
		"brake": 21.0,
		"nitro": 0.30,
		"steer": 1.95,
		"mass": MASS,
	}, false)
	car.input_enabled = false
	model = CarModelScript.new()
	model.name = "Body"
	add_child(model)
	model.build({"body": "sedan", "class": "sport", "paint": "pearl", "color": "f2f4ff"}, "pearl", "stock")
	# patrol livery: near-black shell, the roof bar does the talking
	model.set_paint_live(Color(0.055, 0.062, 0.078))
	car.attach_model(model)
	_build_light_bar()
	# place after the model exists so the body follows the chassis on frame one
	car.global_position = pos
	car.reset_car(pos, 0.0)


func _build_light_bar() -> void:
	_light_bar = Node3D.new()
	_light_bar.name = "LightBar"
	_light_bar.position = Vector3(0.0, 1.58, -0.05)
	add_child(_light_bar)
	var base := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(1.30, 0.10, 0.28)
	base.mesh = bm
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = Color(0.05, 0.05, 0.06)
	bmat.roughness = 0.5
	base.material_override = bmat
	_light_bar.add_child(base)
	for side in [-1.0, 1.0]:
		var lens := MeshInstance3D.new()
		var lm := BoxMesh.new()
		lm.size = Vector3(0.56, 0.12, 0.24)
		lens.mesh = lm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.95, 0.06, 0.10) if side < 0.0 else Color(0.10, 0.28, 1.0)
		mat.emission_enabled = true
		mat.emission = mat.albedo_color
		mat.emission_energy_multiplier = 1.4
		lens.material_override = mat
		lens.position = Vector3(0.30 * side, 0.02, 0.0)
		lens.set_meta("unit", side)
		_light_bar.add_child(lens)
	var beacon := OmniLight3D.new()
	beacon.name = "Beacon"
	beacon.light_color = Color(0.25, 0.42, 1.0)
	beacon.light_energy = 2.4
	beacon.omni_range = 17.0
	beacon.shadow_enabled = false
	beacon.position = Vector3(0.0, 0.24, 0.0)
	_light_bar.add_child(beacon)


func _process(delta: float) -> void:
	if _light_bar == null or car == null:
		return
	_flash += delta * 7.5
	var red_phase: bool = fmod(_flash, 1.0) < 0.5
	var beacon: OmniLight3D = _light_bar.get_node_or_null("Beacon")
	if beacon:
		beacon.light_energy = 2.8 if red_phase else 0.4
		beacon.light_color = Color(1.0, 0.12, 0.16) if red_phase else Color(0.20, 0.38, 1.0)
	for child in _light_bar.get_children():
		if child is MeshInstance3D and child.has_meta("unit"):
			var side: float = float(child.get_meta("unit"))
			var lit: bool = (red_phase and side < 0.0) or (not red_phase and side > 0.0)
			var mat: StandardMaterial3D = child.material_override
			if mat != null:
				mat.emission_energy_multiplier = 8.0 if lit else 0.5


## Steer at the target and keep the throttle planted, easing off for corners and
## for a target that is closer than the braking distance.
func pursue(target: Vector3, delta: float) -> void:
	if car == null:
		return
	var to_target: Vector3 = target - car.global_position
	var dist: float = to_target.length()
	var flat := Vector3(to_target.x, 0.0, to_target.z)
	if flat.length_squared() > 0.01:
		var desired_yaw: float = atan2(-flat.x, -flat.z)
		var err: float = wrapf(desired_yaw - car.rotation.y, -PI, PI)
		_steer_smooth = lerpf(_steer_smooth, clampf(err * 1.7, -1.0, 1.0), clampf(delta * 8.0, 0.0, 1.0))
		var braking_distance: float = car.speed_kmh() / 3.6 * 1.35
		var throttle: float = 1.0
		var brake: float = 0.0
		if dist < braking_distance and dist < 60.0:
			throttle = 0.0
			brake = clampf(1.0 - dist / maxf(1.0, braking_distance), 0.0, 1.0)
		if absf(err) > 0.95 and car.speed_kmh() > 80.0:
			throttle = minf(throttle, 0.25)
		var nitro: bool = dist > 60.0 and absf(err) < 0.30 and car.nitro_amount > 0.25
		var handbrake: bool = absf(err) > 1.1 and car.speed_kmh() > 65.0
		car.set_inputs(throttle, brake, _steer_smooth, nitro, handbrake)
	# the chase unit drives itself this frame; the engine keeps ticking for the
	# rest of the chassis (suspension, slide resolution, impact bookkeeping)
	car._physics_process(delta)
