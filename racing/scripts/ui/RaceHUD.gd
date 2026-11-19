extends Control
## In-race HUD: speedometer arc, gear, rpm ring, nitro bar, position/lap,
## minimap, countdown, wrong-way + damage warnings, touch controls.

signal pause_pressed

const ARC_SEGMENTS := 44

var player
var track_data
var accent = Color("22e9ff")

var _rpm_arc: Control
var _speed_label: Label
var _gear_label: Label
var _pos_label: Label
var _lap_label: Label
var _time_label: Label
var _best_label: Label
var _nitro_fill: ColorRect
var _nitro_glow: Panel
var _countdown: Label
var _warn: Label
var _minimap: Control
var _speedlines: ColorRect
var _damage_fill: ColorRect
var _drift_label: Label
var _drift_score = 0.0
var _steer_touch = 0.0
var _touch_left = false
var _touch_right = false
var _nitro_btn: Button
var _brake_btn: Button
var _mobile = true

const SPEEDO_SIZE := 300.0
const SPEEDO_MARGIN := 46.0


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mobile = OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()
	_build_top()
	_build_speedo()
	_build_touch()
	_build_warnings()
	_speedlines = UIStyle.make_speedlines()
	add_child(_speedlines)
	move_child(_speedlines, 0)
	_build_countdown()


func _build_top() -> void:
	var top = HBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 40
	top.offset_right = -40
	top.offset_top = 34
	top.add_theme_constant_override("separation", 18)
	add_child(top)
	var pos_panel = UIStyle.make_glass_panel(22, Color(0.03, 0.05, 0.09, 0.62), 20, 0.18)
	pos_panel.custom_minimum_size = Vector2(210, 0)
	var pv = VBoxContainer.new()
	pv.add_theme_constant_override("separation", -6)
	pos_panel.add_child(pv)
	pv.add_child(UIStyle.make_kicker(Localization.t("hud.position"), accent, 16))
	_pos_label = UIStyle.make_title("1/6", 54, accent)
	pv.add_child(_pos_label)
	top.add_child(pos_panel)
	var lap_panel = UIStyle.make_glass_panel(22, Color(0.03, 0.05, 0.09, 0.62), 20, 0.0)
	lap_panel.custom_minimum_size = Vector2(210, 0)
	var lv = VBoxContainer.new()
	lv.add_theme_constant_override("separation", -6)
	lap_panel.add_child(lv)
	lv.add_child(UIStyle.make_kicker(Localization.t("hud.lap"), accent, 16))
	_lap_label = UIStyle.make_title("1/3", 54, Color.WHITE)
	lv.add_child(_lap_label)
	top.add_child(lap_panel)
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	var time_panel = UIStyle.make_glass_panel(22, Color(0.03, 0.05, 0.09, 0.62), 20, 0.0)
	var tv = VBoxContainer.new()
	tv.add_theme_constant_override("separation", -4)
	time_panel.add_child(tv)
	tv.add_child(UIStyle.make_kicker(Localization.t("hud.time"), accent, 16))
	_time_label = UIStyle.make_label("00:00.00", "numeric", 42, Color.WHITE)
	tv.add_child(_time_label)
	_best_label = UIStyle.make_label("--:--.--", "numeric", 20, UIStyle.TEXT_DIM)
	tv.add_child(_best_label)
	top.add_child(time_panel)
	var pause = UIStyle.make_icon_button("pause", 74, accent)
	pause.pressed.connect(func(): pause_pressed.emit())
	top.add_child(pause)


func _build_speedo() -> void:
	var wrap = Control.new()
	wrap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	wrap.offset_left = -SPEEDO_SIZE - SPEEDO_MARGIN
	wrap.offset_top = -SPEEDO_SIZE - SPEEDO_MARGIN + 10
	wrap.offset_right = -SPEEDO_MARGIN
	wrap.offset_bottom = -SPEEDO_MARGIN + 10
	wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(wrap)
	_rpm_arc = Control.new()
	_rpm_arc.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rpm_arc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rpm_arc.draw.connect(_draw_speedo)
	wrap.add_child(_rpm_arc)
	var v = VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_CENTER)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.add_child(v)
	_speed_label = UIStyle.make_title("0", 96, accent, HORIZONTAL_ALIGNMENT_CENTER)
	_speed_label.custom_minimum_size = Vector2(SPEEDO_SIZE, 0)
	v.add_child(_speed_label)
	var kmh = UIStyle.make_kicker("KM/H", UIStyle.TEXT_DIM, 18)
	kmh.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kmh.custom_minimum_size = Vector2(SPEEDO_SIZE, 0)
	v.add_child(kmh)
	_gear_label = UIStyle.make_title("1", 44, UIStyle.MAGENTA, HORIZONTAL_ALIGNMENT_CENTER)
	_gear_label.custom_minimum_size = Vector2(SPEEDO_SIZE, 0)
	v.add_child(_gear_label)
	# nitro bar under speedo
	var nwrap = Panel.new()
	nwrap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	nwrap.offset_left = -SPEEDO_SIZE - SPEEDO_MARGIN
	nwrap.offset_top = -36
	nwrap.offset_right = -SPEEDO_MARGIN
	nwrap.offset_bottom = -12
	nwrap.add_theme_stylebox_override("panel", UIStyle.flat_box(Color(1, 1, 1, 0.08), 12))
	nwrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(nwrap)
	_nitro_fill = ColorRect.new()
	_nitro_fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_nitro_fill.offset_right = 0
	_nitro_fill.offset_left = 0
	_nitro_fill.offset_top = 0
	_nitro_fill.offset_bottom = 0
	_nitro_fill.color = UIStyle.CYAN
	_nitro_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	nwrap.add_child(_nitro_fill)
	var nlabel = UIStyle.make_kicker("NITRO", UIStyle.CYAN, 15)
	nlabel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	nlabel.offset_left = -SPEEDO_SIZE - SPEEDO_MARGIN
	nlabel.offset_top = -58
	nlabel.offset_right = -SPEEDO_MARGIN
	nlabel.offset_bottom = -36
	nlabel.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	add_child(nlabel)
	# damage bar on the left side under the minimap
	var dwrap = Panel.new()
	dwrap.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	dwrap.offset_left = 46
	dwrap.offset_top = -10
	dwrap.offset_right = 246
	dwrap.offset_bottom = 6
	dwrap.add_theme_stylebox_override("panel", UIStyle.flat_box(Color(1, 1, 1, 0.08), 8))
	dwrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dwrap)
	_damage_fill = ColorRect.new()
	_damage_fill.color = UIStyle.LIME
	_damage_fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_damage_fill.offset_right = 0
	_damage_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dwrap.add_child(_damage_fill)
	var dl = UIStyle.make_kicker("HULL", UIStyle.TEXT_DIM, 14)
	dl.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	dl.offset_left = 46
	dl.offset_top = -34
	dl.offset_right = 246
	dl.offset_bottom = -12
	add_child(dl)
	# minimap
	_minimap = Control.new()
	_minimap.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_minimap.offset_left = 40
	_minimap.offset_top = 150
	_minimap.offset_right = 300
	_minimap.offset_bottom = 410
	_minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_minimap.draw.connect(_draw_minimap)
	add_child(_minimap)
	_drift_label = UIStyle.make_title("", 40, UIStyle.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	_drift_label.set_anchors_preset(Control.PRESET_CENTER)
	_drift_label.offset_left = -300
	_drift_label.offset_right = 300
	_drift_label.offset_top = -210
	_drift_label.offset_bottom = -150
	_drift_label.modulate.a = 0.0
	add_child(_drift_label)


func _build_touch() -> void:
	var left = UIStyle.make_icon_button("back", 132, Color.WHITE)
	left.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	left.offset_left = 40
	left.offset_top = -176
	left.offset_right = 172
	left.offset_bottom = -44
	left.button_down.connect(func(): _touch_left = true)
	left.button_up.connect(func(): _touch_left = false)
	left.visible = _mobile
	add_child(left)
	var right = UIStyle.make_icon_button("play", 132, Color.WHITE)
	right.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	right.offset_left = 188
	right.offset_top = -176
	right.offset_right = 320
	right.offset_bottom = -44
	right.button_down.connect(func(): _touch_right = true)
	right.button_up.connect(func(): _touch_right = false)
	right.visible = _mobile
	add_child(right)
	_brake_btn = UIStyle.make_button(Localization.t("hud.brake"), UIStyle.RED, false, 24, 104)
	_brake_btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_brake_btn.offset_left = -SPEEDO_SIZE - SPEEDO_MARGIN - 150
	_brake_btn.offset_top = -140
	_brake_btn.offset_right = -SPEEDO_SIZE - SPEEDO_MARGIN - 20
	_brake_btn.offset_bottom = -36
	_brake_btn.visible = _mobile
	add_child(_brake_btn)
	_nitro_btn = UIStyle.make_button(Localization.t("hud.nitro"), UIStyle.CYAN, true, 24, 104)
	_nitro_btn.set_anchors_preset(Control.PRESET_BOTTOM_CENTER)
	_nitro_btn.offset_left = -90
	_nitro_btn.offset_top = -150
	_nitro_btn.offset_right = 90
	_nitro_btn.offset_bottom = -46
	_nitro_btn.visible = _mobile
	add_child(_nitro_btn)


func _build_warnings() -> void:
	_warn = UIStyle.make_title("", 54, UIStyle.RED, HORIZONTAL_ALIGNMENT_CENTER)
	_warn.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_warn.offset_left = -400
	_warn.offset_right = 400
	_warn.offset_top = 170
	_warn.offset_bottom = 250
	_warn.modulate.a = 0.0
	add_child(_warn)


func _build_countdown() -> void:
	_countdown = UIStyle.make_title("3", 220, accent, HORIZONTAL_ALIGNMENT_CENTER)
	_countdown.set_anchors_preset(Control.PRESET_FULL_RECT)
	_countdown.offset_top = -40
	_countdown.modulate.a = 0.0
	add_child(_countdown)


func start_countdown() -> void:
	for txt in ["3", "2", "1", "GO!"]:
		_countdown.text = txt
		_countdown.scale = Vector2(1.6, 1.6)
		_countdown.pivot_offset = size * 0.5
		var tw = create_tween()
		tw.set_parallel(true)
		tw.tween_property(_countdown, "modulate:a", 1.0, 0.08)
		tw.tween_property(_countdown, "scale", Vector2.ONE, 0.30).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		AudioDirector.play_sfx("countdown_beep" if txt != "GO!" else "countdown_go", -2.0)
		await get_tree().create_timer(0.72).timeout
		var out = create_tween()
		out.tween_property(_countdown, "modulate:a", 0.0, 0.18)
		await out.finished


func tick(delta: float, stats: Dictionary) -> void:
	if player == null:
		return
	var kmh: float = float(stats.get("speed", 0.0))
	_speed_label.text = "%d" % int(round(kmh))
	_gear_label.text = str(stats.get("gear", 1))
	_pos_label.text = str(stats.get("position_text", "-"))
	_lap_label.text = str(stats.get("lap_text", "-"))
	_time_label.text = str(stats.get("time_text", "00:00.00"))
	var best = str(stats.get("best_text", "--:--.--"))
	_best_label.text = "BEST " + best
	var nitro: float = float(stats.get("nitro", 0.0))
	_nitro_fill.offset_right = (SPEEDO_SIZE) * clampf(nitro, 0.0, 1.0)
	_nitro_fill.color = UIStyle.CYAN if nitro > 0.25 else UIStyle.AMBER
	var dmg: float = float(stats.get("damage", 0.0))
	_damage_fill.offset_right = 200.0 * (1.0 - clampf(dmg, 0.0, 1.0))
	_damage_fill.color = UIStyle.LIME if dmg < 0.4 else (UIStyle.AMBER if dmg < 0.75 else UIStyle.RED)
	var target_intensity = clampf((kmh - 140.0) / 260.0, 0.0, 1.0) * 0.9
	if stats.get("nitro_active", false):
		target_intensity = minf(1.0, target_intensity + 0.45)
	var mat: ShaderMaterial = _speedlines.material
	mat.set_shader_parameter("intensity", lerpf(float(mat.get_shader_parameter("intensity")), target_intensity, delta * 3.0))
	var drift: float = float(stats.get("drift", 0.0))
	if drift > 0.35:
		_drift_score += drift * delta * 120.0
		_drift_label.text = "DRIFT  %d" % int(_drift_score)
		_drift_label.modulate.a = minf(1.0, _drift_label.modulate.a + delta * 5.0)
	else:
		_drift_score = 0.0
		_drift_label.modulate.a = maxf(0.0, _drift_label.modulate.a - delta * 3.0)
	if stats.get("wrong_way", false):
		flash_warning(Localization.t("hud.wrong_way"), UIStyle.RED)
	_rpm_arc.queue_redraw()
	_minimap.queue_redraw()


func flash_warning(text: String, color: Color) -> void:
	_warn.text = text
	_warn.add_theme_color_override("font_color", color)
	_warn.modulate.a = 1.0


func _process(delta: float) -> void:
	if _warn.modulate.a > 0.0:
		_warn.modulate.a = maxf(0.0, _warn.modulate.a - delta * 1.2)


func _draw_speedo() -> void:
	if player == null:
		return
	var c = Vector2(SPEEDO_SIZE * 0.5, SPEEDO_SIZE * 0.5)
	var r = SPEEDO_SIZE * 0.5 - 16.0
	var start = deg_to_rad(138.0)
	var span = deg_to_rad(264.0)
	_rpm_arc.draw_arc(c, r, start, start + span, 64, Color(1, 1, 1, 0.07), 16.0, true)
	var rpm: float = clampf(float(player.call("rpm_ratio")), 0.0, 1.0)
	var fill_end = start + span * rpm
	var col = accent.lerp(UIStyle.MAGENTA, rpm)
	_rpm_arc.draw_arc(c, r, start, fill_end, 64, Color(col.r, col.g, col.b, 0.95), 16.0, true)
	_rpm_arc.draw_arc(c, r, start, start + span, 64, Color(1, 1, 1, 0.05), 3.0, true)
	for i in range(ARC_SEGMENTS + 1):
		var a = start + span * (float(i) / float(ARC_SEGMENTS))
		var d = Vector2(cos(a), sin(a))
		var inner = c + d * (r - 26.0)
		var outer = c + d * (r - 18.0) if i % 4 == 0 else c + d * (r - 22.0)
		_rpm_arc.draw_line(inner, outer, Color(1, 1, 1, 0.22), 2.0)


func _draw_minimap() -> void:
	if track_data == null:
		return
	var rect = Rect2(Vector2.ZERO, _minimap.size)
	_minimap.draw_rect(rect, Color(0.02, 0.03, 0.06, 0.55), true)
	var pts: PackedVector3Array = track_data.points
	if pts.size() < 2:
		return
	var min_x = 1.0e9
	var max_x = -1.0e9
	var min_z = 1.0e9
	var max_z = -1.0e9
	for i in range(0, pts.size(), 8):
		min_x = minf(min_x, pts[i].x)
		max_x = maxf(max_x, pts[i].x)
		min_z = minf(min_z, pts[i].z)
		max_z = maxf(max_z, pts[i].z)
	var pad = 18.0
	var sc = minf((_minimap.size.x - pad * 2.0) / maxf(1.0, max_x - min_x),
		(_minimap.size.y - pad * 2.0) / maxf(1.0, max_z - min_z))
	for i in range(0, pts.size() - 1, 4):
		var a = _map_point(pts[i], min_x, min_z, sc, pad)
		var b = _map_point(pts[i + 1], min_x, min_z, sc, pad)
		_minimap.draw_line(a, b, Color(0.55, 0.72, 0.95, 0.75), 3.0)
	if player and is_instance_valid(player):
		var p = _map_point(player.global_position, min_x, min_z, sc, pad)
		_minimap.draw_circle(p, 6.0, accent)


func _map_point(v: Vector3, min_x: float, min_z: float, sc: float, pad: float) -> Vector2:
	return Vector2(pad + (v.x - min_x) * sc, pad + (v.z - min_z) * sc)


func touch_steer() -> float:
	var v = 0.0
	if _touch_left:
		v -= 1.0
	if _touch_right:
		v += 1.0
	return v


func touch_brake() -> float:
	if _brake_btn and _brake_btn.visible and _brake_btn.button_pressed:
		return 1.0
	return 0.0


func touch_nitro() -> bool:
	return _nitro_btn != null and _nitro_btn.visible and _nitro_btn.button_pressed
