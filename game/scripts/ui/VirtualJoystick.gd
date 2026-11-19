class_name VirtualJoystick
extends Control
## Touch analogue stick; reports a normalised Vector2 to InputManager.

var input: RefCounted
var _knob: Control
var _active := false
var _index := -1
var _centre := Vector2.ZERO
var _radius := 58.0

func setup(p_input: RefCounted) -> void:
	input = p_input
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(150, 150)
	_knob = Control.new()
	_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_knob)

func _ready() -> void:
	_centre = size * 0.5

func _draw() -> void:
	var c := size * 0.5
	draw_circle(c, _radius, Color(0.1, 0.15, 0.2, 0.45))
	draw_arc(c, _radius, 0, TAU, 32, Color(0.4, 0.85, 0.82, 0.8), 2)
	draw_circle(c + (_knob.position - _centre), 22, Color(0.4, 0.9, 0.85, 0.85))

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		if t.pressed and not _active:
			_active = true
			_index = t.index
			_centre = t.position
			_knob.position = _centre
			queue_redraw()
		elif not t.pressed and t.index == _index:
			_end()
	elif event is InputEventScreenDrag and _active:
		var d := event as InputEventScreenDrag
		if d.index != _index:
			return
		var offset := d.position - _centre
		if offset.length() > _radius:
			offset = offset.normalized() * _radius
		_knob.position = _centre + offset
		input.set_move(offset / _radius)
		queue_redraw()

func _end() -> void:
	_active = false
	_index = -1
	input.set_move(Vector2.ZERO)
	_knob.position = _centre
	queue_redraw()
