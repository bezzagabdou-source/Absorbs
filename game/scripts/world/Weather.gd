class_name Weather
extends RefCounted
## Five weather states. Rain darkens the sky, adds particles and reduces grip.

enum State { CLEAR, CLOUDY, RAIN, STORM, FOG }

var state: int = State.CLEAR
var day_night: DayNight
var particles: GPUParticles3D
var wind: float = 0.0
var _timer: float = 0.0
var _rng := RandomNumberGenerator.new()

func setup(p_day: DayNight, quality: int) -> void:
	day_night = p_day
	_rng.seed = 91
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(60, 1, 60)
	mat.direction = Vector3(0.18, -1, 0)
	mat.spread = 3.0
	mat.gravity = Vector3(0, -14, 0)
	mat.initial_velocity_min = 22.0
	mat.initial_velocity_max = 30.0
	mat.scale_min = 0.5
	mat.scale_max = 1.0
	var quad := QuadMesh.new()
	quad.size = Vector2(0.09, 0.65)
	var drop := StandardMaterial3D.new()
	drop.albedo_color = Color(0.72, 0.84, 0.96, 0.55)
	drop.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	quad.material = drop
	particles = GPUParticles3D.new()
	particles.process_material = mat
	particles.draw_pass_1 = quad
	particles.amount = Quality.preset(quality)["rain"]
	particles.lifetime = 1.2
	particles.emitting = false
	particles.visible = false

func set_state(s: int) -> void:
	state = clampi(s, 0, 4)
	if particles != null:
		particles.emitting = state == State.RAIN or state == State.STORM
		particles.visible = particles.emitting
	if day_night != null and day_night._env != null:
		var env := day_night._env
		match state:
			State.CLOUDY:
				env.fog_density = 0.0022
				env.ambient_light_energy *= 0.85
			State.RAIN:
				env.fog_density = 0.0032
				env.ambient_light_energy *= 0.75
			State.STORM:
				env.fog_density = 0.0045
				env.ambient_light_energy *= 0.55
			State.FOG:
				env.fog_density = 0.012
			_:
				env.fog_density = 0.0016
	var bus: Node = Engine.get_main_loop().root.get_node_or_null("GameManager/EventBus")
	if bus != null and bus.has_signal("weather_changed"):
		bus.emit_signal("weather_changed", state)

func tick(delta: float, player_pos: Vector3) -> void:
	_timer += delta
	if _timer > 45.0:
		_timer = 0.0
		if _rng.randf() < 0.25:
			set_state(_rng.randi_range(0, 4))
	if particles != null:
		particles.global_position = player_pos + Vector3(0, 12, 0)
	wind = sin(_timer * 0.2) * 0.5

func grip_modifier() -> float:
	match state:
		State.RAIN:
			return 0.82
		State.STORM:
			return 0.68
		_:
			return 1.0

func label(locale: String) -> String:
	var names_en := ["Clear", "Cloudy", "Rain", "Thunderstorm", "Fog"]
	var names_ar := ["صافٍ", "غائم", "مطر", "عاصفة رعدية", "ضباب"]
	return (names_ar if locale == "ar" else names_en)[state]
