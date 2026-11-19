class_name SaveSystemV2
extends RefCounted
## Versioned 3-slot + autosave system with encrypted JSON and v1 migration.

const VERSION := 2
const SLOT_COUNT := 3

static func slot_path(slot: int) -> String:
	return AppConfig.SAVE_PREFIX + str(clampi(slot, 1, SLOT_COUNT)) + ".json"

static func autosave_path() -> String:
	return "user://nova_mira_v2_autosave.json"

static func path_for(slot: int) -> String:
	return autosave_path() if slot == 0 else slot_path(slot)

static func empty_data() -> Dictionary:
	return {
		"version": VERSION, "money": 500, "health": 100.0, "armour": 0.0,
		"pos": [0.0, 1.0, 0.0], "weapon": 2, "mission": 0, "stars": 0,
		"hour": 18.0, "weather": 0, "completed": [], "properties": [],
		"locale": "en", "quality": "medium", "stats": {"driving": 0, "shooting": 0},
	}

static func migrate(payload: Dictionary) -> Dictionary:
	var version := int(payload.get("version", 1))
	var data: Dictionary = (payload.get("data", payload) as Dictionary).duplicate(true)
	if version < 2:
		if not data.has("quality"):
			data["quality"] = "medium"
		if not data.has("locale"):
			data["locale"] = "ar" if data.has("weapon") else "en"
		if not data.has("completed"):
			data["completed"] = []
		if typeof(data.get("ammo")) == TYPE_DICTIONARY:
			data["ammo_v2"] = (data["ammo"] as Dictionary).duplicate(true)
		data["migrated_from"] = version
	data["version"] = VERSION
	return data

static func save(slot: int, data: Dictionary) -> bool:
	var payload := {
		"version": VERSION,
		"saved_at": Time.get_unix_time_from_system(),
		"data": migrate(data),
	}
	var f := FileAccess.open_encrypted_with_pass(path_for(slot), FileAccess.WRITE, "nova-mira-v2-local")
	if f == null:
		return false
	f.store_string(JSON.stringify(payload))
	f.close()
	return true

static func load_slot(slot: int) -> Dictionary:
	var path := path_for(slot)
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open_encrypted_with_pass(path, FileAccess.READ, "nova-mira-v2-local")
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var payload := parsed as Dictionary
	var data := migrate(payload)
	data["saved_at"] = float(payload.get("saved_at", 0.0))
	return data

static func has(slot: int) -> bool:
	return FileAccess.file_exists(path_for(slot))

static func delete(slot: int) -> void:
	var path := path_for(slot)
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

static func list_slots() -> Array:
	var result: Array = []
	for slot in range(0, SLOT_COUNT + 1):
		var data := load(slot)
		result.append({
			"slot": slot, "exists": not data.is_empty(),
			"saved_at": float(data.get("saved_at", 0.0)),
			"money": int(data.get("money", 0)),
		})
	return result
