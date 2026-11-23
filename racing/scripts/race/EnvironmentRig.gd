extends Node3D
## Sky shader, sun/moon, fog, post-processing (glow, ACES, adjustments) and
## rain particles. Presets cover city night/day, desert, canyon, mountain and
## coast looks.

const SKY_SHADER := """
shader_type sky;
uniform vec3 top_color : source_color = vec3(0.02, 0.03, 0.09);
uniform vec3 horizon_color : source_color = vec3(0.35, 0.18, 0.35);
uniform vec3 ground_color : source_color = vec3(0.03, 0.03, 0.05);
uniform vec3 glow_color : source_color = vec3(1.0, 0.4, 0.5);
uniform float stars = 0.0;
uniform float cloudiness = 0.35;
uniform vec3 sun_dir = vec3(0.4, 0.2, -0.6);

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float v = 0.0; float a = 0.55;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
    return v;
}

void sky() {
    vec3 dir = EYEDIR;
    float h = clamp(dir.y, -1.0, 1.0);
    vec3 col = mix(horizon_color, top_color, smoothstep(0.0, 0.55, h));
    col = mix(col, ground_color, smoothstep(0.0, -0.25, h));
    float sd = max(dot(dir, normalize(sun_dir)), 0.0);
    col += glow_color * pow(sd, 220.0) * 6.0;
    col += glow_color * pow(sd, 12.0) * 0.35;
    if (stars > 0.0 && h > 0.0) {
        vec3 sdir = dir * 260.0;
        float s = hash(floor(sdir));
        float tw = step(0.9975, s) * (0.6 + 0.4 * sin(TIME * 3.0 + s * 40.0));
        col += vec3(tw) * stars * smoothstep(0.0, 0.2, h);
    }
    if (cloudiness > 0.0) {
        vec3 cp = dir * 3.2 / max(0.15, h + 0.15);
        float c = fbm(cp + vec3(TIME * 0.006, 0.0, TIME * 0.004));
        float mask = smoothstep(0.55, 0.85, c) * cloudiness * smoothstep(0.0, 0.25, h);
        vec3 cloud_col = mix(horizon_color * 1.4, glow_color * 0.8, pow(sd, 4.0));
        col = mix(col, cloud_col, mask);
    }
    COLOR = col;
}
"""

const PRESETS := {
	"city_night": {
		# Real night skies are blue-black, not purple. The magenta horizon was a
		# stylistic choice that made every frame look like a different game and
		# fought the cyan road markings; this is the physical version — deep navy
		# zenith, warm sodium glow where city light hits the haze, neutral bounce.
		"top": Color(0.012, 0.020, 0.055), "horizon": Color(0.105, 0.145, 0.235),
		"ground": Color(0.018, 0.020, 0.026), "glow": Color(1.0, 0.62, 0.36),
		# A moon at y=0.28 sits ~16 deg above the horizon, so 20 m hills cast
		# 90 m shadows and the whole map reads as black wedges. Overhead-ish
		# moonlight keeps the terrain lit while still reading as night.
		"stars": 1.0, "clouds": 0.45, "sun_dir": Vector3(0.30, 0.92, -0.42),
		"sun_color": Color(0.72, 0.82, 1.0), "sun_energy": 0.70,
		"ambient": Color(0.24, 0.30, 0.42), "ambient_energy": 1.5,
		"fog": Color(0.055, 0.070, 0.105),
		"fog_density": 0.0016, "glow_intensity": 1.1,
	},
	"city_day": {
		"top": Color(0.16, 0.36, 0.68), "horizon": Color(0.62, 0.76, 0.92),
		"ground": Color(0.10, 0.11, 0.13), "glow": Color(1.0, 0.96, 0.86),
		"stars": 0.0, "clouds": 0.35, "sun_dir": Vector3(-0.4, 0.55, -0.7),
		"sun_color": Color(1.0, 0.96, 0.9), "sun_energy": 1.5,
		"ambient": Color(0.5, 0.58, 0.7), "fog": Color(0.62, 0.72, 0.84),
		"fog_density": 0.0011, "glow_intensity": 0.5,
	},
	"desert_day": {
		"top": Color(0.18, 0.42, 0.78), "horizon": Color(0.96, 0.72, 0.48),
		"ground": Color(0.42, 0.30, 0.20), "glow": Color(1.0, 0.86, 0.55),
		"stars": 0.0, "clouds": 0.18, "sun_dir": Vector3(0.55, 0.42, -0.72),
		"sun_color": Color(1.0, 0.90, 0.72), "sun_energy": 1.7,
		"ambient": Color(0.62, 0.54, 0.44), "fog": Color(0.86, 0.70, 0.52),
		"fog_density": 0.0018, "glow_intensity": 0.65,
	},
	"canyon_sunset": {
		"top": Color(0.14, 0.08, 0.24), "horizon": Color(0.90, 0.36, 0.30),
		"ground": Color(0.22, 0.10, 0.10), "glow": Color(1.0, 0.55, 0.30),
		"stars": 0.15, "clouds": 0.5, "sun_dir": Vector3(0.8, 0.12, -0.55),
		"sun_color": Color(1.0, 0.68, 0.42), "sun_energy": 1.2,
		"ambient": Color(0.36, 0.22, 0.26), "fog": Color(0.52, 0.22, 0.22),
		"fog_density": 0.0022, "glow_intensity": 0.9,
	},
	"mountain_day": {
		"top": Color(0.20, 0.34, 0.60), "horizon": Color(0.72, 0.80, 0.88),
		"ground": Color(0.18, 0.22, 0.20), "glow": Color(1.0, 0.98, 0.92),
		"stars": 0.0, "clouds": 0.5, "sun_dir": Vector3(-0.3, 0.5, -0.8),
		"sun_color": Color(1.0, 0.97, 0.92), "sun_energy": 1.4,
		"ambient": Color(0.48, 0.56, 0.66), "fog": Color(0.70, 0.78, 0.86),
		"fog_density": 0.0014, "glow_intensity": 0.45,
	},
	"mountain_night": {
		"top": Color(0.02, 0.04, 0.12), "horizon": Color(0.16, 0.24, 0.40),
		"ground": Color(0.04, 0.06, 0.09), "glow": Color(0.60, 0.78, 1.0),
		"stars": 1.0, "clouds": 0.3, "sun_dir": Vector3(0.3, 0.6, -0.75),
		"sun_color": Color(0.55, 0.68, 0.95), "sun_energy": 0.42,
		"ambient": Color(0.12, 0.16, 0.28), "fog": Color(0.10, 0.14, 0.22),
		"fog_density": 0.0026, "glow_intensity": 0.9,
	},
	"coast_sunset": {
		"top": Color(0.10, 0.18, 0.40), "horizon": Color(1.0, 0.56, 0.34),
		"ground": Color(0.10, 0.14, 0.20), "glow": Color(1.0, 0.72, 0.40),
		"stars": 0.0, "clouds": 0.55, "sun_dir": Vector3(-0.7, 0.14, -0.7),
		"sun_color": Color(1.0, 0.74, 0.50), "sun_energy": 1.1,
		"ambient": Color(0.40, 0.36, 0.44), "fog": Color(0.60, 0.40, 0.36),
		"fog_density": 0.0014, "glow_intensity": 0.85,
	},
}

var world_env: WorldEnvironment
var sun: DirectionalLight3D
var rain: GPUParticles3D
var sky_mat: ShaderMaterial
var _wet = false
var _fog_height: float = 0.0
var probe: ReflectionProbe


func setup(env: String, time_of_day: String, weather: String, accent: Color,
		fog_height: float = 0.0) -> void:
	_wet = weather == "rain"
	_fog_height = fog_height
	var p: Dictionary = PRESETS.get(_preset_key(env, time_of_day), PRESETS["city_night"])
	_build_sky(p, weather)
	_build_sun(p)
	_build_world_env(p, accent)
	_build_reflection_probe(Vector3.ZERO, 700.0)
	if _wet:
		_build_rain()


func _preset_key(env: String, tod: String) -> String:
	var key = "city_night"
	if env == "city":
		key = "city_night" if tod == "night" else "city_day"
	elif env == "desert":
		key = "canyon_sunset" if tod == "sunset" else "desert_day"
	elif env == "mountain":
		key = "mountain_night" if tod == "night" else "mountain_day"
	elif env == "coast":
		key = "coast_sunset" if tod == "sunset" else "city_day"
	return key


func _build_sky(p: Dictionary, weather: String) -> void:
	sky_mat = ShaderMaterial.new()
	var sh = Shader.new()
	sh.code = SKY_SHADER
	sky_mat.shader = sh
	sky_mat.set_shader_parameter("top_color", p["top"])
	sky_mat.set_shader_parameter("horizon_color", p["horizon"])
	sky_mat.set_shader_parameter("ground_color", p["ground"])
	sky_mat.set_shader_parameter("glow_color", p["glow"])
	sky_mat.set_shader_parameter("stars", float(p["stars"]) * (0.35 if weather == "rain" else 1.0))
	sky_mat.set_shader_parameter("cloudiness", minf(1.0, float(p["clouds"]) + (0.45 if weather == "rain" else 0.0)))
	sky_mat.set_shader_parameter("sun_dir", p["sun_dir"])


func _build_sun(p: Dictionary) -> void:
	sun = DirectionalLight3D.new()
	sun.light_color = p["sun_color"]
	sun.light_energy = float(p["sun_energy"]) * (0.55 if _wet else 1.0)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 160.0
	sun.directional_shadow_split_1 = 0.06
	sun.directional_shadow_split_2 = 0.22
	sun.directional_shadow_blend_splits = true
	# A near-vertical light on a near-flat terrain is the worst case for shadow
	# acne: depth differences across a texel are tiny, so the comparison flips and
	# the entire ground renders as if it were in shadow. These biases, plus a
	# small angular diameter, are what stop the terrain going black.
	sun.shadow_bias = 0.06
	sun.shadow_normal_bias = 2.2
	sun.shadow_blur = 1.4
	sun.light_angular_distance = 0.5
	var dir: Vector3 = p["sun_dir"]
	add_child(sun)
	sun.position = dir.normalized() * 100.0
	sun.look_at(Vector3.ZERO, Vector3.UP)


## World environment: physically-plausible atmosphere, ACES in the post stack,
## SSAO-style contact shading off (costly on mobile), fog with height falloff,
## sky reflections and a modest glow for the neon signage.
func _build_world_env(p: Dictionary, accent: Color) -> void:
	world_env = WorldEnvironment.new()
	var e = Environment.new()
	var sky = Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_sky_contribution = 0.62
	e.ambient_light_color = p["ambient"]
	e.ambient_light_energy = clampf(float(p.get("ambient_energy", 1.15)), 0.4, 2.4)
	# A sky-only reflection source makes wet tarmac and car paint look flat: there
	# is nothing for them to mirror but the gradient. A probe around the play area
	# gives the paint the road, the kerbs and the skyline, which is the single
	# biggest realism win per millisecond on a phone.
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.sdfgi_enabled = false

	# --- tonemapping: ACES in-engine, our post shader adds the grade --------
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.tonemap_exposure = 1.0
	e.tonemap_white = 6.5

	# --- bloom / glow: neon should bleed, highlights should not smear ------
	e.glow_enabled = true
	e.glow_intensity = float(p["glow_intensity"])
	e.glow_strength = 1.05
	e.glow_bloom = 0.16
	e.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	e.glow_hdr_threshold = 1.0
	e.glow_hdr_scale = 2.4
	e.glow_normalized = true
	e.set_glow_level(0, 0.0)
	e.set_glow_level(1, 0.35)
	e.set_glow_level(2, 0.75)
	e.set_glow_level(3, 1.0)
	e.set_glow_level(4, 0.85)
	e.set_glow_level(5, 0.55)
	e.set_glow_level(6, 0.25)

	# --- atmosphere --------------------------------------------------------
	e.fog_enabled = true
	e.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	e.fog_light_color = (p["fog"] as Color).lerp(accent, 0.14)
	e.fog_light_energy = 1.0
	e.fog_density = float(p["fog_density"]) * (2.1 if _wet else 1.0)
	e.fog_aerial_perspective = 0.55
	e.fog_sky_affect = 0.30
	e.fog_height = maxf(0.0, _fog_height)
	e.fog_height_density = 0.22
	e.fog_sun_scatter = 0.35

	# --- ground truth shading ---------------------------------------------
	e.ssao_enabled = false       # mobile: keep the frame budget
	e.ssr_enabled = false
	e.ssil_enabled = false
	e.sdfgi_enabled = false
	e.volumetric_fog_enabled = false

	# --- subtle grading (post shader does the heavy lifting) ---------------
	e.adjustment_enabled = true
	e.adjustment_brightness = 1.0
	e.adjustment_contrast = 1.05
	e.adjustment_saturation = 1.10

	world_env.environment = e
	add_child(world_env)


## A single box probe covering the drivable area. `update_mode` is set to ONCE so
## the cube map is baked a handful of frames after the world is built and then
## costs nothing; it is refreshed when the car has travelled far enough that the
## old capture no longer describes its surroundings.
func _build_reflection_probe(centre: Vector3, radius: float) -> void:
	probe = ReflectionProbe.new()
	probe.size = Vector3(radius * 2.0, radius * 1.2, radius * 2.0)
	probe.position = centre + Vector3.UP * radius * 0.25
	probe.origin_offset = Vector3.ZERO
	probe.box_projection = true
	probe.interior = false
	probe.update_mode = ReflectionProbe.UPDATE_ONCE
	probe.cull_mask = 0xFFFFF
	probe.blend_distance = 6.0
	probe.intensity = 1.05
	probe.max_distance = radius * 2.4
	probe.ambient_mode = ReflectionProbe.AMBIENT_DISABLED
	add_child(probe)


func _build_rain() -> void:
	rain = GPUParticles3D.new()
	rain.amount = 2400
	rain.lifetime = 1.4
	rain.preprocess = 1.0
	rain.visibility_aabb = AABB(Vector3(-80, -30, -80), Vector3(160, 60, 160))
	rain.position = Vector3(0, 26, 0)
	var pm = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(60, 2, 60)
	pm.direction = Vector3(0.12, -1, 0.05)
	pm.spread = 2.0
	pm.initial_velocity_min = 42.0
	pm.initial_velocity_max = 58.0
	pm.gravity = Vector3(0, -9.8, 0)
	pm.scale_min = 0.6
	pm.scale_max = 1.2
	rain.process_material = pm
	var mesh = QuadMesh.new()
	mesh.size = Vector2(0.035, 0.9)
	var mat = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.65, 0.8, 1.0, 0.35)
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mesh.material = mat
	rain.draw_pass_1 = mesh
	rain.layers = 3
	add_child(rain)


func set_rain_follow(pos: Vector3) -> void:
	if rain:
		rain.position = Vector3(pos.x, pos.y + 26.0, pos.z)


## ---------------------------------------------------------------------------
## RUNTIME TIME OF DAY + WEATHER
## ---------------------------------------------------------------------------
## The presets above are fixed moods. A free-roam world needs to move through
## them continuously, so this rebuilds the sky/sun/fog from a [0,1) day fraction
## (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset) while reusing the
## same preset keys the tracks already select.

## Live weather override: "clear", "rain" or "fog". Setting it re-tints the fog
## and turns the rain emitter on or off without rebuilding the whole rig.
func set_weather(weather: String) -> void:
	_wet = weather == "rain"
	if world_env != null and world_env.environment != null:
		var e: Environment = world_env.environment
		match weather:
			"rain":
				e.fog_density = maxf(e.fog_density, 0.0042)
				e.fog_light_color = e.fog_light_color.lerp(Color(0.32, 0.34, 0.38), 0.5)
			"fog":
				e.fog_density = maxf(e.fog_density, 0.0055)
				e.fog_light_color = e.fog_light_color.lerp(Color(0.55, 0.58, 0.62), 0.35)
			_:
				e.fog_density = maxf(0.0008, e.fog_density * 0.45)
	if weather == "rain":
		if rain == null:
			_build_rain()
		rain.emitting = true
	elif rain != null:
		rain.emitting = false
	if sun != null:
		# overcast light is softer and dimmer; do not multiply repeatedly
		sun.light_energy = lerpf(sun.light_energy, sun.light_energy * 0.62, 1.0 if _wet else 0.0)
		_day_key = -1


func weather_is_wet() -> bool:
	return _wet


## Move the whole rig to a point on the day. Cheap enough to call every frame:
## it only writes shader uniforms and light properties, and only the coarse
## keyframes are recomputed when the hour bucket changes.
func set_day_fraction(f: float) -> void:
	var day_key: int = int(f * 24.0)
	if day_key == _day_key:
		_update_day_lighting(f)
		return
	_day_key = day_key
	var p: Dictionary = _day_preset(f)
	_preset_cache = p
	if sky_mat != null:
		sky_mat.set_shader_parameter("top_color", p["top"])
		sky_mat.set_shader_parameter("horizon_color", p["horizon"])
		sky_mat.set_shader_parameter("ground_color", p["ground"])
		sky_mat.set_shader_parameter("glow_color", p["glow"])
		sky_mat.set_shader_parameter("stars", float(p["stars"]))
		sky_mat.set_shader_parameter("cloudiness", float(p["clouds"]))
	if world_env != null and world_env.environment != null:
		var e: Environment = world_env.environment
		e.ambient_light_color = p["ambient"]
		e.ambient_light_energy = float(p["ambient_energy"])
		e.fog_light_color = p["fog"]
		e.fog_density = float(p["fog_density"])
		e.glow_intensity = float(p["glow_intensity"])
	_update_day_lighting(f)


var _day_key: int = -1
var _preset_cache: Dictionary = {}


func _update_day_lighting(f: float) -> void:
	if sun == null or _preset_cache.is_empty():
		return
	var sun_angle: float = (f - 0.25) * TAU      ## sunrise at the horizon
	var elevation: float = sin(sun_angle)
	var azimuth: float = cos(sun_angle)
	var dir := Vector3(azimuth * 0.85, maxf(0.06, elevation), -0.35).normalized()
	sun.position = dir * 100.0
	sun.look_at(Vector3.ZERO, Vector3.UP)
	var p: Dictionary = _preset_cache
	# sunrise / sunset get a warm, low-energy light; noon is white and hard
	var warm: float = clampf(1.0 - absf(elevation) * 2.2, 0.0, 1.0)
	var day: float = clampf(elevation, 0.0, 1.0)
	var color: Color = (p["sun_color"] as Color).lerp(Color(1.0, 0.52, 0.24), warm * 0.8)
	sun.light_color = color
	sun.light_energy = lerpf(0.10, float(p["sun_energy"]), clampf(day * 1.6 + 0.15, 0.0, 1.0))
	if sky_mat != null:
		sky_mat.set_shader_parameter("sun_dir", dir)


## Blend the four anchor presets (night, dawn, day, dusk) into a smooth curve.
func _day_preset(f: float) -> Dictionary:
	var night: Dictionary = PRESETS["city_night"]
	var day: Dictionary = PRESETS["city_day"]
	var dawn: Dictionary = PRESETS["coast_sunset"]
	var dusk: Dictionary = PRESETS["canyon_sunset"]
	var out: Dictionary = {}
	if f < 0.22:
		out = _blend(night, night, f / 0.22)
	elif f < 0.30:
		out = _blend(night, dawn, (f - 0.22) / 0.08)
	elif f < 0.42:
		out = _blend(dawn, day, (f - 0.30) / 0.12)
	elif f < 0.58:
		out = _blend(day, day, 0.0)
	elif f < 0.70:
		out = _blend(day, dusk, (f - 0.58) / 0.12)
	elif f < 0.80:
		out = _blend(dusk, night, (f - 0.70) / 0.10)
	else:
		out = _blend(night, night, 0.0)
	return out


func _blend(a: Dictionary, b: Dictionary, t: float) -> Dictionary:
	t = clampf(t, 0.0, 1.0)
	var out: Dictionary = {}
	for k in a.keys():
		var va = a[k]
		var vb = b.get(k, va)
		if va is Color:
			out[k] = (va as Color).lerp(vb as Color, t)
		elif va is float or va is int:
			out[k] = lerpf(float(va), float(vb), t)
		elif va is Vector3:
			out[k] = (va as Vector3).lerp(vb as Vector3, t)
		else:
			out[k] = va
	# a blended preset must always carry these two, some anchors omit them
	if not out.has("ambient_energy"):
		out["ambient_energy"] = 1.15
	return out
