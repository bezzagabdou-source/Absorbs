extends Control
## Modern mobile driving controls.
##
##   * a real steering wheel that the thumb spins (angle follows the finger,
##     with spring recentre) instead of two arrow buttons
##   * accelerator + brake as tall pressure-style pedals on the right, which
##     report an analogue 0..1 value based on how far up the pedal you press
##   * a nitro button that swells and glows while the tank is draining
##
## Everything is custom-drawn, so it stays crisp at any resolution and needs no
## image assets. The widget is purely presentational: the race screen polls
## steer_value(), throttle_value() and nitro_held().

signal wheel_changed(value: float)

const WHEEL_RADIUS := 150.0
const MAX_WHEEL_ANGLE := 2.2          # radians of visual rotation
const DEAD_ZONE := 0.06

var _wheel_angle := 0.0               # current visual angle
var _steer := 0.0                     # -1..1 reported to the car
var _dragging := false
var _drag_origin := Vector2.ZERO
var _throttle := 0.0
var _brake := 0.0
var _nitro := false
var _nitro_charge := 1.0
var _wheel_center := Vector2.ZERO
var _wheel_pos := Rect2()
var _pedal_gas := Rect2()
var _pedal_brake := Rect2()
var _nitro_rect := Rect2()
var _gas_down := false
var _brake_down := false
var _accent := Color(0.13, 0.91, 1.0)


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process_input(true)
	resized.connect(_layout)
	_layout()


func _layout() -> void:
	var s := size
	# wheel bottom-left
	var wheel_size := WHEEL_RADIUS * 2.0 + 40.0
	_wheel_pos = Rect2(Vector2(48, s.y - wheel_size - 36), Vector2(wheel_size, wheel_size))
	_wheel_center = _wheel_pos.position + _wheel_pos.size * 0.5
	# pedals bottom-right, with the nitro stacked above them
	var pw := 132.0
	var ph := 240.0
	_pedal_brake = Rect2(Vector2(s.x - 48 - pw * 2 - 22, s.y - ph - 44), Vector2(pw, ph))
	_pedal_gas = Rect2(Vector2(s.x - 48 - pw, s.y - ph - 44), Vector2(pw, ph))
	_nitro_rect = Rect2(Vector2(s.x - 48 - pw * 2 - 22, s.y - ph - 44 - 118 - 20), Vector2(pw * 2 + 22, 118))


func set_accent(c: Color) -> void:
	_accent = c
	queue_redraw()


func set_nitro_charge(v: float) -> void:
	_nitro_charge = clampf(v, 0.0, 1.0)
	queue_redraw()


func steer_value() -> float:
	return _steer


func throttle_value() -> float:
	return _throttle


func brake_value() -> float:
	return _brake


func nitro_held() -> bool:
	return _nitro


## Recentre the wheel when the finger lifts, so the car straightens gently.
func _process(delta: float) -> void:
	if not _dragging and absf(_steer) > 0.001:
		_steer = lerpf(_steer, 0.0, clampf(delta * 7.0, 0.0, 1.0))
		_wheel_angle = lerpf(_wheel_angle, _steer * MAX_WHEEL_ANGLE, clampf(delta * 12.0, 0.0, 1.0))
		queue_redraw()
	# pedals ramp rather than snap: feels like a real throttle pedal
	var target_t := 1.0 if _gas_down else 0.0
	var target_b := 1.0 if _brake_down else 0.0
	if absf(_throttle - target_t) > 0.01 or absf(_brake - target_b) > 0.01:
		_throttle = move_toward(_throttle, target_t, delta * 6.0)
		_brake = move_toward(_brake, target_b, delta * 7.0)
		queue_redraw()
	if _dragging:
		queue_redraw()


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventMouseButton:
		var pos: Vector2 = event.position
		var pressed: bool = event.pressed
		if not pressed:
			_gas_down = false
			_brake_down = false
			_nitro = false
			_dragging = false
			queue_redraw()
			return
		if _in_circle(pos, _wheel_center, WHEEL_RADIUS + 24.0):
			_dragging = true
			_drag_origin = pos
			queue_redraw()
		elif _pedal_gas.has_point(pos):
			_gas_down = true
			queue_redraw()
		elif _pedal_brake.has_point(pos):
			_brake_down = true
			queue_redraw()
		elif _nitro_rect.has_point(pos):
			_nitro = true
			queue_redraw()
	elif event is InputEventScreenDrag or event is InputEventMouseMotion:
		if _dragging:
			var dx: float = event.position.x - _drag_origin.x
			var raw: float = clampf(dx / (WHEEL_RADIUS * 0.85), -1.0, 1.0)
			if absf(raw) < DEAD_ZONE:
				raw = 0.0
			# cubic response: precise near centre, fast at full lock
			var shaped: float = signf(raw) * pow(absf(raw), 1.55)
			_steer = shaped
			_wheel_angle = shaped * MAX_WHEEL_ANGLE
			wheel_changed.emit(_steer)
			queue_redraw()


func _in_circle(p: Vector2, c: Vector2, r: float) -> bool:
	return p.distance_to(c) <= r


func _draw() -> void:
	_draw_wheel()
	_draw_pedal(_pedal_brake, _brake, Localization.t("hud.brake"), Color(1.0, 0.18, 0.28))
	_draw_pedal(_pedal_gas, _throttle, Localization.t("hud.accel"), _accent)
	_draw_nitro()


func _draw_wheel() -> void:
	var c := _wheel_center
	var r := WHEEL_RADIUS
	# outer glow ring
	draw_circle(c, r + 16.0, Color(_accent.r, _accent.g, _accent.b, 0.13))
	draw_circle(c, r + 6.0, Color(_accent.r, _accent.g, _accent.b, 0.20))

	# rim: draw as a thick arc ring so it reads as a wheel, not a disc
	var rim_col := Color(0.09, 0.11, 0.16, 0.90)
	draw_arc(c, r, 0.0, TAU, 64, rim_col, 30.0, true)
	draw_arc(c, r, 0.0, TAU, 64, Color(_accent.r, _accent.g, _accent.b, 0.55), 3.0, true)

	# rotating spokes: computed from the wheel angle
	var spokes := 3
	for i in range(spokes):
		var a: float = _wheel_angle + TAU * float(i) / float(spokes)
		var dir := Vector2(cos(a), sin(a))
		var inner := c + dir * (r * 0.26)
		var outer := c + dir * (r * 0.93)
		draw_line(inner, outer, Color(0.16, 0.19, 0.26, 0.95), 26.0)
		draw_line(inner, outer, Color(_accent.r, _accent.g, _accent.b, 0.32), 4.0)

	# grip highlight at the top marker
	var top := c + Vector2(0, -1).rotated(_wheel_angle) * (r * 0.86)
	draw_circle(top, 13.0, Color(_accent.r, _accent.g, _accent.b, 0.75))

	# centre hub
	draw_circle(c, r * 0.30, Color(0.06, 0.08, 0.12, 0.95))
	draw_circle(c, r * 0.30, Color(_accent.r, _accent.g, _accent.b, 0.28))
	draw_circle(c, r * 0.12, Color(_accent.r, _accent.g, _accent.b, 0.85))

	# steer amount as an arc under the wheel
	var left := c + Vector2(-r, r * 0.55)
	var right := c + Vector2(r, r * 0.55)
	draw_line(left, right, Color(1, 1, 1, 0.12), 7.0)
	var mid := (left + right) * 0.5
	var knob := mid + Vector2(_steer * r, 0)
	draw_circle(knob, 11.0, Color(_accent.r, _accent.g, _accent.b, 0.95))


func _draw_pedal(rect: Rect2, value: float, label: String, col: Color) -> void:
	var down := value > 0.02
	var base := Color(0.055, 0.07, 0.11, 0.86) if not down else Color(col.r * 0.35, col.g * 0.35, col.b * 0.35, 0.94)
	draw_rect(rect, base, true)
	# fill from bottom: shows the analogue pressure
	if value > 0.01:
		var fill := Rect2(rect.position + Vector2(6, rect.size.y * (1.0 - value) + 6),
			Vector2(rect.size.x - 12, rect.size.y * value - 12))
		draw_rect(fill, Color(col.r, col.g, col.b, 0.55), true)
	draw_rect(rect, Color(col.r, col.g, col.b, 0.75 if down else 0.35), false, 3.0)
	# chevrons on the pedal face
	for i in range(3):
		var y := rect.position.y + rect.size.y * (0.30 + float(i) * 0.18)
		var a := Vector2(rect.position.x + rect.size.x * 0.30, y + 14)
		var b := Vector2(rect.position.x + rect.size.x * 0.50, y)
		var e := Vector2(rect.position.x + rect.size.x * 0.70, y + 14)
		var a2 := a + Vector2(0, 20)
		var e2 := e + Vector2(0, 20)
		draw_line(a, b, Color(1, 1, 1, 0.30), 4.0)
		draw_line(b, e, Color(1, 1, 1, 0.30), 4.0)
		draw_line(a2, b + Vector2(0, 20), Color(1, 1, 1, 0.18), 4.0)
		draw_line(b + Vector2(0, 20), e2, Color(1, 1, 1, 0.18), 4.0)
	# label
	var font: Font = UIStyle.font_for("numeric")
	var fs := 26
	var tw: float = font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(font, Vector2(rect.position.x + (rect.size.x - tw) * 0.5, rect.position.y + rect.size.y - 22),
		label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.92))


func _draw_nitro() -> void:
	var r := _nitro_rect
	var ready := _nitro_charge > 0.02
	var col := Color(0.45, 0.85, 1.0) if ready else Color(0.35, 0.38, 0.45)
	if _nitro:
		col = Color(1.0, 1.0, 1.0)
	draw_rect(r, Color(col.r * 0.25, col.g * 0.25, col.b * 0.30, 0.90 if _nitro else 0.70), true)
	draw_rect(r, Color(col.r, col.g, col.b, 0.85 if _nitro else 0.40), false, 3.0)
	# charge bar across the bottom
	var bar := Rect2(r.position + Vector2(14, r.size.y - 22), Vector2(r.size.x - 28, 10))
	draw_rect(bar, Color(1, 1, 1, 0.12), true)
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * _nitro_charge, bar.size.y)),
		Color(col.r, col.g, col.b, 0.95), true)
	var font: Font = UIStyle.font_for("display")
	var label := Localization.t("hud.nitro")
	var fs := 30
	var tw: float = font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(font, Vector2(r.position.x + (r.size.x - tw) * 0.5, r.position.y + r.size.y * 0.52),
		label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.95))
