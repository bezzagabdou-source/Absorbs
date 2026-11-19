class_name Localization3
extends RefCounted
## Data-driven AR/EN/FR table. Godot's TextServer + the bundled OFL Arabic font
## perform shaping and RTL layout; this class owns locale selection and keys.

signal locale_changed(code: String)

var locale: String = "en"
var _locales: Dictionary = {}

func _init(initial_locale: String = "en") -> void:
	load_table()
	set_locale(initial_locale)

func load_table() -> bool:
	var f := FileAccess.open(AppConfig.data_path("localization.json"), FileAccess.READ)
	if f == null:
		push_warning("[Localization3] missing localization.json")
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var root := parsed as Dictionary
	_locales = root.get("locales", {})
	return not _locales.is_empty()

func available_locales() -> Array:
	return _locales.keys()

func set_locale(code: String) -> void:
	if not _locales.has(code):
		return
	if code == locale:
		return
	locale = code
	locale_changed.emit(code)

func t(key: String, args: Array = []) -> String:
	var table: Dictionary = _locales.get(locale, {})
	var value := String(table.get(key, key))
	if not args.is_empty():
		value = value % args
	return value

func tr_text(key: String) -> String:
	return t(key)

func is_rtl() -> bool:
	return locale == "ar"

func shaped(text: String) -> String:
	# Glyph shaping is handled by TextServerAdvanced at draw time; returning the
	# logical string keeps the API stable for future custom shaping hooks.
	return text
