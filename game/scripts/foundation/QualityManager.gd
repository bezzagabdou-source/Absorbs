class_name QualityManager
extends RefCounted
## Four tiers, 50-150% resolution scale, frame caps and per-effect switches.
## All values come from data/quality_tiers.json so they can be tuned without code.

signal changed

var tiers: Array = []
var index: int = 1
var resolution_scale: float = 1.0
var fps_cap: int = 60
var effects: Dictionary = {}
var scale_min: float = 0.5
var scale_max: float = 1.5

func _init() -> void:
	load_tiers()

func load_tiers() -> bool:
	var f := FileAccess.open(AppConfig.data_path("quality_tiers.json"), FileAccess.READ)
	if f == null:
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var root := parsed as Dictionary
	tiers = root.get("tiers", [])
	var bounds: Array = root.get("resolution_scale_range", [0.5, 1.5])
	scale_min = float(bounds[0])
	scale_max = float(bounds[1])
	if tiers.is_empty():
		return false
	select(index)
	return true

func tier() -> Dictionary:
	if tiers.is_empty():
		return {}
	return tiers[clampi(index, 0, tiers.size() - 1)]

func select(selector: Variant) -> void:
	var next_index := index
	if typeof(selector) == TYPE_STRING:
		for i in range(tiers.size()):
			if String((tiers[i] as Dictionary).get("id", "")) == String(selector):
				next_index = i
				break
	else:
		next_index = clampi(int(selector), 0, tiers.size() - 1)
	index = clampi(next_index, 0, maxi(0, tiers.size() - 1))
	var t: Dictionary = tier()
	resolution_scale = clampf(float(t.get("resolution_scale", 1.0)), scale_min, scale_max)
	fps_cap = clampi(int(t.get("fps_cap", 60)), 15, 240)
	effects = (t.get("effects", {}) as Dictionary).duplicate(true)
	apply()
	changed.emit()

func set_resolution_scale(value: float) -> void:
	resolution_scale = clampf(value, scale_min, scale_max)
	apply()
	changed.emit()

func set_fps_cap(value: int) -> void:
	fps_cap = clampi(value, 15, 240)
	apply()
	changed.emit()

func set_effect(name: String, enabled: bool) -> void:
	effects[name] = enabled
	changed.emit()

func apply(lights: Array = []) -> void:
	var loop := Engine.get_main_loop() as SceneTree
	if loop == null:
		return
	var viewport: Window = loop.root
	viewport.scaling_3d_scale = resolution_scale
	Engine.max_fps = fps_cap
	var t: Dictionary = tier()
	for light in lights:
		if light is DirectionalLight3D:
			var l := light as DirectionalLight3D
			l.shadow_enabled = bool(t.get("shadows", false))
			l.directional_shadow_max_distance = float(t.get("view_distance", 250.0))

static func resolve_tier(frame_ms: float) -> int:
	if frame_ms <= 8.3:
		return 3
	if frame_ms <= 12.0:
		return 2
	if frame_ms <= 18.0:
		return 1
	return 0

func summary() -> Dictionary:
	var t: Dictionary = tier()
	return {
		"id": t.get("id", "medium"), "scale": resolution_scale, "fps_cap": fps_cap,
		"traffic": t.get("traffic", 0), "peds": t.get("peds", 0),
		"memory_mb": t.get("memory_mb", 0), "effects": effects,
	}
