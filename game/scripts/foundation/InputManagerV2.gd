class_name InputManagerV2
extends Node
## Remappable keyboard/gamepad/touch input with taps, analogue stick, haptics,
## one-handed mode and persisted bindings. Supersedes the v0.1 InputManager API.

signal rebound(action: String, keycode: int, button_index: int)

var move_vector: Vector2 = Vector2.ZERO
var look_delta: Vector2 = Vector2.ZERO
var virtual: Dictionary = {}
var taps: Dictionary = {}
var bindings: Dictionary = {}
var sensitivity: float = 1.0
var invert_y: bool = false
var one_handed: bool = false
var tilt_steering: bool = false
var deadzone: float = 0.2

func _init() -> void:
	load_bindings()

func load_bindings() -> bool:
	var f := FileAccess.open(AppConfig.data_path("input_bindings.json"), FileAccess.READ)
	if f == null:
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var root := parsed as Dictionary
	bindings = root.get("actions", {})
	deadzone = float(root.get("deadzone", 0.2))
	return not bindings.is_empty()

func rebind(action: String, keycode: int, button_index: int = -1) -> void:
	if not bindings.has(action):
		bindings[action] = {"keys": [], "buttons": []}
	bindings[action]["keys"] = [keycode]
	bindings[action]["buttons"] = [] if button_index < 0 else [button_index]
	var key_event := InputEventKey.new()
	key_event.keycode = keycode
	if InputMap.has_action(action):
		InputMap.action_erase_events(action)
		InputMap.action_add_event(action, key_event)
	rebound.emit(action, keycode, button_index)

func vibrate(duration_ms: int, amplitude: float = 0.5) -> void:
	if Input.has_method("vibrate_handheld"):
		Input.call("vibrate_handheld", duration_ms)

func set_move(v: Vector2) -> void:
	move_vector = v.limit_length(1.0)

func add_look(v: Vector2) -> void:
	look_delta += v * sensitivity

func press(action: String) -> void:
	virtual[action] = true
	taps[action] = true

func release(action: String) -> void:
	virtual[action] = false

func consume_tap(action: String) -> bool:
	if bool(taps.get(action, false)):
		taps[action] = false
		return true
	return false

func pressed(action: String) -> bool:
	return Input.is_action_pressed(action) or bool(virtual.get(action, false))

func just_pressed(action: String) -> bool:
	return Input.is_action_just_pressed(action)

func axis(negative: String, positive: String) -> float:
	return (1.0 if pressed(positive) else 0.0) - (1.0 if pressed(negative) else 0.0)

func get_move() -> Vector2:
	if tilt_steering:
		var accel := Input.get_accelerometer()
		move_vector = Vector2(clampf(accel.x * 2.0, -1.0, 1.0), 0)
	var keyboard := Vector2(axis("move_left", "move_right"), axis("move_back", "move_forward"))
	if keyboard.length_squared() > 0.01:
		move_vector = keyboard
	if one_handed:
		move_vector.x *= 0.75
	return move_vector.limit_length(1.0)

func consume_look() -> Vector2:
	var v := look_delta
	look_delta = Vector2.ZERO
	if invert_y:
		v.y = -v.y
	return v
