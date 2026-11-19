class_name InputManager
extends Node
## Unified keyboard / gamepad / touch input. Virtual controls call set_move/press.

var move_vector: Vector2 = Vector2.ZERO
var look_delta: Vector2 = Vector2.ZERO
var virtual: Dictionary = {}
var taps: Dictionary = {}
var sensitivity: float = 1.0
var invert_y: bool = false

func set_move(v: Vector2) -> void:
	move_vector = v.limit_length(1.0)

func add_look(v: Vector2) -> void:
	look_delta += v * sensitivity

func press(action: String) -> void:
	virtual[action] = true
	taps[action] = true

func consume_tap(action: String) -> bool:
	if bool(taps.get(action, false)):
		taps[action] = false
		return true
	return false

func release(action: String) -> void:
	virtual[action] = false

func pressed(action: String) -> bool:
	return Input.is_action_pressed(action) or bool(virtual.get(action, false))

func just_pressed(action: String) -> bool:
	return Input.is_action_just_pressed(action)

func axis(negative: String, positive: String) -> float:
	return (1.0 if pressed(positive) else 0.0) - (1.0 if pressed(negative) else 0.0)

func get_move() -> Vector2:
	var m := Vector2(axis("move_left", "move_right"), axis("move_back", "move_forward"))
	if move_vector.length_squared() > 0.01:
		m = move_vector
	return m.limit_length(1.0)

func consume_look() -> Vector2:
	var v := look_delta
	look_delta = Vector2.ZERO
	if invert_y:
		v.y = -v.y
	return v
