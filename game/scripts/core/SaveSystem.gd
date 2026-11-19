class_name SaveSystem
extends RefCounted
## Local encrypted JSON save. Deterministic and unit-tested in CI.

const SAVE_PATH := "user://nova_mira_save.json"
const SAVE_PASS := "nova-mira-0.1-local"
const VERSION := 1

static func default_data() -> Dictionary:
	return {
		"version": VERSION,
		"money": 500,
		"health": 100.0,
		"armour": 0.0,
		"pos": [0.0, 1.0, 0.0],
		"weapon": 2,
		"ammo": {"pistol": 36, "smg": 90, "rifle": 60, "shotgun": 24, "sniper": 10},
		"weapons_owned": [0, 1, 2, 3, 4, 5, 6, 7],
		"mission": 0,
		"completed": [],
		"stars": 0,
		"hour": 18.0,
		"weather": 0,
		"properties": [],
		"stats": {"driving": 0, "shooting": 0, "stamina": 0},
		"locale": "ar",
		"quality": 1,
		"skills": {"strength": 1, "speed": 1, "accuracy": 1, "driving": 1},
	}

static func save(data: Dictionary) -> bool:
	var payload := data.duplicate(true)
	payload["version"] = VERSION
	var json := JSON.stringify(payload)
	var f := FileAccess.open_encrypted_with_pass(SAVE_PATH, FileAccess.WRITE, SAVE_PASS)
	if f == null:
		push_warning("[SaveSystem] cannot open save file: %d" % FileAccess.get_open_error())
		return false
	f.store_string(json)
	f.close()
	return true

static func load_data() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return default_data()
	var f := FileAccess.open_encrypted_with_pass(SAVE_PATH, FileAccess.READ, SAVE_PASS)
	if f == null:
		return default_data()
	var text := f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return default_data()
	var result: Dictionary = default_data()
	for k in (parsed as Dictionary).keys():
		result[k] = (parsed as Dictionary)[k]
	return result

static func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

static func delete_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
