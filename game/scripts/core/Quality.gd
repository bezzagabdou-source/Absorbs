class_name Quality
extends RefCounted
## Three quality tiers plus runtime thermal-style downgrade.

const PRESETS := [
	{"name": "Low", "scale": 0.75, "shadow": false, "view": 150.0, "traffic": 8, "peds": 8, "rain": 180},
	{"name": "Medium", "scale": 1.0, "shadow": true, "view": 260.0, "traffic": 14, "peds": 14, "rain": 380},
	{"name": "High", "scale": 1.0, "shadow": true, "view": 420.0, "traffic": 20, "peds": 22, "rain": 700},
]

static func apply(level: int, fps_cap: int) -> void:
	level = clamp(level, 0, 2)
	var p: Dictionary = PRESETS[level]
	var vp: Window = Engine.get_main_loop().root
	vp.scaling_3d_scale = float(p["scale"])
	Engine.max_fps = fps_cap
	for n in vp.find_children("*", "DirectionalLight3D", true, false):
		var l := n as DirectionalLight3D
		l.shadow_enabled = bool(p["shadow"])
		l.directional_shadow_max_distance = float(p["view"])

static func preset(level: int) -> Dictionary:
	return PRESETS[clamp(level, 0, 2)]
