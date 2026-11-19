class_name SettingsStore
extends RefCounted
## Small versioned JSON settings store; all foundation systems share it.

const VERSION := 1
var data: Dictionary = {}

func _init() -> void:
	data = _load()

func _load() -> Dictionary:
	if not FileAccess.file_exists(AppConfig.SETTINGS_PATH):
		return {"version": VERSION, "values": {}}
	var f := FileAccess.open(AppConfig.SETTINGS_PATH, FileAccess.READ)
	if f == null:
		return {"version": VERSION, "values": {}}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"version": VERSION, "values": {}}
	var result := parsed as Dictionary
	if int(result.get("version", 0)) != VERSION or typeof(result.get("values")) != TYPE_DICTIONARY:
		return {"version": VERSION, "values": {}}
	return result

func get_value(key: String, fallback: Variant) -> Variant:
	var values: Dictionary = data.get("values", {})
	return values.get(key, fallback)

func set_value(key: String, value: Variant) -> void:
	var values: Dictionary = data.get("values", {})
	values[key] = value
	data["values"] = values

func flush() -> bool:
	data["version"] = VERSION
	var f := FileAccess.open(AppConfig.SETTINGS_PATH, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(data))
	f.close()
	return true
