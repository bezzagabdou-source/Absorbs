class_name DayNight
extends RefCounted
## 24 game hours = 48 real minutes. Controls sun, sky, fog and ambient light.

var hour: float = 18.0
var speed: float = 1.0 / 120.0  # hours per second
var sun: DirectionalLight3D
var world_env: WorldEnvironment
var _env: Environment

func setup(p_sun: DirectionalLight3D, p_env: WorldEnvironment) -> void:
	sun = p_sun
	world_env = p_env
	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.fog_enabled = true
	_env.fog_density = 0.0016
	_env.fog_sky_affect = 0.7
	world_env.environment = _env
	apply()

func tick(delta: float) -> void:
	hour = fposmod(hour + delta * speed * speed_multiplier(), 24.0)
	apply()

func speed_multiplier() -> float:
	return 1.0

func apply() -> void:
	if sun == null or _env == null:
		return
	var angle := (hour - 6.0) / 24.0 * TAU
	sun.rotation_degrees = Vector3(rad_to_deg(-angle) + 90.0, 35.0, 0.0)
	var day: float = clampf(sin(angle) * 0.5 + 0.5, 0.0, 1.0)
	var night: float = 1.0 - day
	sun.light_energy = lerpf(0.03, 1.5, day)
	var warm := Color(1.0, 0.55, 0.30)
	var white := Color(1.0, 0.96, 0.88)
	sun.light_color = white.lerp(warm, (1.0 - absf(day - 0.55) * 2.0) * 0.35)
	var sky_day := Color(0.34, 0.55, 0.78)
	var sky_night := Color(0.025, 0.035, 0.075)
	var dusk := Color(0.86, 0.36, 0.24)
	var sky := sky_night.lerp(sky_day, day)
	if day > 0.05 and day < 0.4:
		sky = sky.lerp(dusk, (0.4 - absf(day - 0.22)) * 1.6)
	_env.background_color = sky
	_env.ambient_light_color = sky
	_env.ambient_light_energy = lerpf(0.18, 0.75, day)
	_env.fog_color = sky
	var bus: Node = Engine.get_main_loop().root.get_node_or_null("GameManager/EventBus")
	if bus != null and bus.has_signal("time_changed"):
		bus.emit_signal("time_changed", hour)

func formatted_time() -> String:
	var h := int(hour)
	var m := int((hour - float(h)) * 60.0)
	return "%02d:%02d" % [h, m]
