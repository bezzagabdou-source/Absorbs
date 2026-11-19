extends Node
## User settings, persisted to user://settings.cfg and applied at runtime.

signal changed(key: String, value: Variant)

const PATH := "user://settings.cfg"

const DEFAULTS := {
	"language": "en",
	"quality": "high",           # low | medium | high | ultra
	"render_scale": 1.0,          # 0.6 .. 1.0 (3D viewport resolution)
	"motion_blur": true,
	"camera_shake": true,
	"show_fps": false,
	"music": 0.7,
	"sfx": 0.85,
	"engine": 0.8,
	"steer_mode": "tilt",         # tilt | buttons | wheel
	"sensitivity": 1.0,
	"assist": true,
	"invert_tilt": false,
	"vibration": true,
}

var values: Dictionary = {}


func _ready() -> void:
	values = DEFAULTS.duplicate(true)
	load_settings()


func get_value(key: String, fallback: Variant = null) -> Variant:
	if values.has(key):
		return values[key]
	return fallback


func set_value(key: String, value: Variant) -> void:
	if values.get(key) == value:
		return
	values[key] = value
	apply(key, value)
	save_settings()
	changed.emit(key, value)


func cycle_quality() -> String:
	var order = ["low", "medium", "high", "ultra"]
	var i: int = order.find(str(values.get("quality", "high")))
	var next: String = order[(i + 1) % order.size()]
	set_value("quality", next)
	return next


func quality_index() -> int:
	return ["low", "medium", "high", "ultra"].find(str(values.get("quality", "medium")))


func apply_all() -> void:
	for k in values.keys():
		apply(k, values[k])
	Localization.set_language(str(values.get("language", "en")))


func apply(key: String, value: Variant) -> void:
	match key:
		"language":
			Localization.set_language(str(value))
		"quality":
			_apply_quality(str(value))
		"music":
			_set_bus_db("Music", float(value))
		"sfx":
			_set_bus_db("SFX", float(value))
		"engine":
			_set_bus_db("Engine", float(value))
		"assist", "steer_mode", "sensitivity", "invert_tilt", "motion_blur", \
		"camera_shake", "render_scale", "show_fps", "vibration":
			pass


func _set_bus_db(bus: String, linear: float) -> void:
	var idx = AudioServer.get_bus_index(bus)
	if idx < 0:
		return
	if linear <= 0.001:
		AudioServer.set_bus_mute(idx, true)
	else:
		AudioServer.set_bus_mute(idx, false)
		AudioServer.set_bus_volume_db(idx, linear_to_db(clampf(linear, 0.0, 1.5)))


func _apply_quality(quality: String) -> void:
	var tier: Dictionary = {
		"low": {"scale": 0.62, "shadow": 0, "glow": false, "ssao": false, "aa": 0, "fog": true},
		"medium": {"scale": 0.78, "shadow": 1024, "glow": true, "ssao": false, "aa": 0, "fog": true},
		"high": {"scale": 0.92, "shadow": 2048, "glow": true, "ssao": false, "aa": 1, "fog": true},
		"ultra": {"scale": 1.0, "shadow": 4096, "glow": true, "ssao": true, "aa": 2, "fog": true},
	}
	var cfg: Dictionary = tier.get(quality, tier["high"])
	if not bool(values.get("_manual_scale", false)):
		values["render_scale"] = cfg["scale"]
	if int(cfg["shadow"]) > 0:
		RenderingServer.directional_shadow_atlas_set_size(int(cfg["shadow"]), true)
	var vp = get_viewport()
	if vp:
		vp.msaa_3d = int(cfg["aa"])
		vp.screen_space_aa = 1 if int(cfg["aa"]) == 0 else 0


func save_settings() -> void:
	var cfg = ConfigFile.new()
	for k in values.keys():
		if str(k).begins_with("_"):
			continue
		cfg.set_value("settings", k, values[k])
	cfg.save(PATH)


func load_settings() -> void:
	var cfg = ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	for k in DEFAULTS.keys():
		if cfg.has_section_key("settings", k):
			values[k] = cfg.get_value("settings", k)


func reset_defaults() -> void:
	values = DEFAULTS.duplicate(true)
	apply_all()
	save_settings()
