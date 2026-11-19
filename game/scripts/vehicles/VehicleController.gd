class_name VehicleController
extends VehicleBody3D
## Wheel-collider vehicle with damage, fuel, horn, radio and damage particles.

var spec: Dictionary
var input: Node
var bus: EventBus
var weather: Weather
var is_player_vehicle: bool = false
var autopilot: bool = false
var autopilot_steer: float = 0.0
var autopilot_throttle: float = 1.0
var driver: Node3D = null
var damage: float = 0.0
var fuel: float = 100.0
var speed_kmh: float = 0.0
var radio_index: int = 0
var alive: bool = true
var _engine_audio: AudioStreamPlayer3D
var _smoke: GPUParticles3D
var _lights: Array[MeshInstance3D] = []
var _wheels: Array[VehicleWheel3D] = []
var _horn: AudioStreamPlayer3D
var _last_speed: float = 0.0

func setup(p_spec: Dictionary, p_input: Node, p_bus: EventBus, p_weather: Weather) -> void:
	spec = p_spec
	input = p_input
	bus = p_bus
	weather = p_weather
	mass = float(spec["mass"])
	linear_damp = 0.22
	angular_damp = 1.4
	_build_body()
	_build_wheels()
	_build_effects()
	body_entered.connect(_on_body_entered)
	var horn_stream := load("res://assets/audio/horn.wav")
	if horn_stream != null:
		_horn = AudioStreamPlayer3D.new()
		_horn.stream = horn_stream
		_horn.max_distance = 60.0
		add_child(_horn)

func _build_body() -> void:
	var w := 2.0
	var l := 4.5
	var h := 0.75
	if spec["type"] == 1:
		w = 0.9
		l = 2.3
		h = 0.5
	elif spec["id"] == "truck":
		w = 2.6
		l = 8.0
		h = 1.4
	elif spec["id"] == "boat":
		w = 2.4
		l = 6.5
		h = 0.9
	elif spec["type"] == 3:
		w = 2.2
		l = 4.0
		h = 0.9
	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(w, h, l)
	body.mesh = box
	body.position.y = 0.7
	var mat := StandardMaterial3D.new()
	mat.albedo_color = spec["color"]
	mat.metallic = 0.55
	mat.roughness = 0.28
	body.material_override = mat
	add_child(body)
	if spec["type"] == 0:
		var cabin := MeshInstance3D.new()
		var cb := BoxMesh.new()
		cb.size = Vector3(w * 0.88, 0.7, l * 0.48)
		cabin.mesh = cb
		cabin.position = Vector3(0, 1.35, -0.25)
		var glass := StandardMaterial3D.new()
		glass.albedo_color = Color(0.12, 0.20, 0.27)
		glass.metallic = 0.4
		glass.roughness = 0.12
		cabin.material_override = glass
		add_child(cabin)
		for side in [-1.0, 1.0]:
			for front in [-1.0, 1.0]:
				var lamp := MeshInstance3D.new()
				var lb := BoxMesh.new()
				lb.size = Vector3(0.28, 0.18, 0.12)
				lamp.mesh = lb
				lamp.position = Vector3(side * w * 0.35, 0.85, front * l * 0.5)
				var lm := StandardMaterial3D.new()
				lm.emission_enabled = true
				lm.emission = Color(1, 0.9, 0.6) if front > 0 else Color(1, 0.15, 0.1)
				lm.emission_energy_multiplier = 2.0
				lamp.material_override = lm
				add_child(lamp)
				_lights.append(lamp)
	var shape := CollisionShape3D.new()
	var cbox := BoxShape3D.new()
	cbox.size = Vector3(w, h + 0.6, l)
	shape.shape = cbox
	shape.position.y = 0.85
	add_child(shape)

func _build_wheels() -> void:
	if spec["type"] != 0 and spec["type"] != 1:
		return
	var half_w := 1.0 if spec["type"] == 0 else 0.5
	var half_l := 1.55 if spec["type"] == 0 else 0.85
	for i in range(4):
		var wheel := VehicleWheel3D.new()
		wheel.wheel_radius = 0.42 if spec["type"] == 0 else 0.36
		wheel.wheel_rest_length = 0.3
		wheel.suspension_stiffness = 32.0
		wheel.damping_compression = 4.0
		wheel.damping_relaxation = 5.0
		wheel.wheel_friction_slip = 1.6 * float(spec["grip"])
		wheel.use_as_steering = i < 2
		wheel.use_as_traction = spec["type"] == 0 or i < 2
		wheel.position = Vector3((-half_w if i % 2 == 0 else half_w), 0.45, (-half_l if i < 2 else half_l))
		add_child(wheel)
		_wheels.append(wheel)

func _build_effects() -> void:
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, 1, 0)
	mat.spread = 25.0
	mat.initial_velocity_min = 1.0
	mat.initial_velocity_max = 3.0
	mat.scale_min = 0.5
	mat.scale_max = 1.5
	mat.gravity = Vector3(0, 1.5, 0)
	var mesh := SphereMesh.new()
	mesh.radius = 0.3
	var pm := StandardMaterial3D.new()
	pm.albedo_color = Color(0.12, 0.12, 0.12, 0.7)
	pm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh.material = pm
	_smoke = GPUParticles3D.new()
	_smoke.process_material = mat
	_smoke.draw_pass_1 = mesh
	_smoke.amount = 24
	_smoke.lifetime = 1.6
	_smoke.emitting = false
	add_child(_smoke)
	var engine_stream := load("res://assets/audio/engine.wav")
	if engine_stream != null:
		_engine_audio = AudioStreamPlayer3D.new()
		_engine_audio.stream = engine_stream
		_engine_audio.max_distance = 35.0
		_engine_audio.volume_db = -18.0
		add_child(_engine_audio)

func enter(p_driver: Node3D) -> void:
	is_player_vehicle = true
	driver = p_driver
	autopilot = false
	if bus != null:
		bus.vehicle_state_changed.emit(true)

func exit() -> void:
	is_player_vehicle = false
	driver = null
	if bus != null:
		bus.vehicle_state_changed.emit(false)

func apply_damage(amount: float) -> void:
	if not alive:
		return
	damage = clampf(damage + amount, 0.0, 1.2)
	_smoke.emitting = damage > 0.55
	if damage >= 1.0:
		explode()

func explode() -> void:
	alive = false
	_smoke.emitting = true
	var sound := AudioStreamPlayer3D.new()
	var s := load("res://assets/audio/explosion.wav")
	if s != null:
		sound.stream = s
		add_child(sound)
		sound.play()
	if driver != null and driver.has_method("take_damage"):
		driver.call("take_damage", 80.0, "torso")
	engine_force = 0.0
	brake = 20.0
	if bus != null:
		bus.toast.emit("Vehicle destroyed — respawning at garage" if false else "Vehicle destroyed")

func _physics_process(delta: float) -> void:
	speed_kmh = linear_velocity.length() * 3.6
	var grip := 1.0 if weather == null else weather.grip_modifier()
	for w in _wheels:
		w.wheel_friction_slip = 1.6 * float(spec["grip"]) * grip
	if is_player_vehicle and input != null:
		var throttle := input.axis("move_back", "move_forward")
		var steer := input.axis("move_left", "move_right")
		if input.pressed("handbrake"):
			brake = 12.0
			steer *= 1.6
		else:
			brake = 4.0 if throttle == 0.0 else 0.0
		var limit := float(spec["top"]) / 3.6
		if absf(linear_velocity.length()) > limit or fuel <= 0.0:
			engine_force = 0.0
		else:
			engine_force = throttle * float(spec["engine"]) * (1.0 - damage * 0.5)
		for w in _wheels:
			if w.use_as_steering:
				w.steering = lerpf(w.steering, steer * 0.52, delta * 8.0)
		fuel = maxf(0.0, fuel - delta * 0.035 * absf(throttle))
		if input.pressed("horn") and _horn != null and not _horn.playing:
			_horn.play()
	elif autopilot:
		engine_force = 22.0 * autopilot_throttle
		brake = 5.0 if autopilot_throttle <= 0.01 else 0.0
		for w in _wheels:
			if w.use_as_steering:
				w.steering = lerpf(w.steering, autopilot_steer, delta * 5.0)
	else:
		engine_force = 0.0
		brake = 5.0
	if _engine_audio != null:
		_engine_audio.pitch_scale = clampf(0.7 + speed_kmh / 100.0, 0.7, 2.2)
		_engine_audio.volume_db = -24.0 if not is_player_vehicle else -14.0
	_last_speed = speed_kmh

func _on_body_entered(body: Node) -> void:
	if body == self:
		return
	var impact := absf(_last_speed - speed_kmh)
	if impact > 9.0:
		apply_damage(clampf(impact / 160.0, 0.02, 0.35))
