class_name UIManager
extends CanvasLayer
## All 2D presentation: splash, live-3D menu, HUD, touch controls, phone, settings.

signal start_requested(new_game: bool)
signal locale_requested(code: String)
signal quality_requested(level: int)
signal mission_requested(index: int)
signal shop_requested(item_id: String)
signal save_requested
signal quit_requested

var loc: Localization
var bus: EventBus
var player: PlayerController
var input: InputManager
var police: PoliceAI
var missions: MissionRunner
var day: DayNight
var weather: Weather
var root: Control
var splash: Control
var menu: Control
var hud: Control
var pause: Control
var phone: Control
var shop_panel: Control
var settings_panel: Control
var mission_panel: Control
var overlay: Control
var _font: Font
var _font_bold: Font
var _hp: ProgressBar
var _armour: ProgressBar
var _stars_label: Label
var _money_label: Label
var _weapon_label: Label
var _time_label: Label
var _weather_label: Label
var _objective_label: Label
var _mission_title: Label
var _speed_label: Label
var _toast_label: Label
var _toast_timer: float = 0.0
var _splash_bar: ProgressBar
var _splash_tip: Label
var _drive_panel: Control
var _fps_label: Label
var _show_fps: bool = false
var _joystick: Control

func setup(p_loc: Localization, p_bus: EventBus, p_input: InputManager) -> void:
	loc = p_loc
	bus = p_bus
	input = p_input
	_font = load("res://assets/fonts/NotoSansArabic-Regular.ttf")
	_font_bold = load("res://assets/fonts/NotoSansArabic-Bold.ttf")
	var theme := Theme.new()
	if _font != null:
		theme.set_font("font", "Label", _font)
		theme.set_font("font", "Button", _font)
		theme.set_font("font", "ProgressBar", _font)
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.theme = theme
	add_child(root)
	_apply_rtl()
	_build_splash()
	_build_menu()
	_build_hud()
	_build_overlays()
	splash.visible = true
	menu.visible = false
	hud.visible = false
	if bus != null:
		bus.toast.connect(show_toast)
		bus.money_changed.connect(_on_money)
		bus.health_changed.connect(_on_health)
		bus.wanted_changed.connect(_on_stars)
		bus.weapon_changed.connect(_on_weapon)
		bus.mission_changed.connect(_on_mission)
		bus.time_changed.connect(_on_time)
		bus.weather_changed.connect(_on_weather)
		bus.vehicle_state_changed.connect(_on_vehicle_state)
		bus.fps_updated.connect(_on_fps)
		bus.player_arrested.connect(_on_arrested)

func _apply_rtl() -> void:
	if root == null:
		return
	root.layout_direction = Control.LAYOUT_DIRECTION_RTL if loc.is_rtl() else Control.LAYOUT_DIRECTION_LTR

func _panel() -> PanelContainer:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.035, 0.055, 0.09, 0.94)
	s.border_color = Color(0.20, 0.78, 0.72, 0.9)
	s.set_border_width_all(2)
	s.set_corner_radius_all(10)
	s.content_margin_left = 24
	s.content_margin_right = 24
	s.content_margin_top = 20
	s.content_margin_bottom = 20
	p.add_theme_stylebox_override("panel", s)
	return p

func _button(text: String, callback: Callable) -> Button:
	var b := Button.new()
	b.text = loc.tr_text(text)
	b.custom_minimum_size = Vector2(260, 52)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(callback)
	if _font_bold != null:
		b.add_theme_font_override("font", _font_bold)
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.09, 0.17, 0.22, 0.95)
	s.set_corner_radius_all(6)
	var sh := StyleBoxFlat.new()
	sh.bg_color = Color(0.14, 0.42, 0.44, 0.95)
	sh.set_corner_radius_all(6)
	b.add_theme_stylebox_override("normal", s)
	b.add_theme_stylebox_override("hover", sh)
	return b

func _label(text: String, size: int = 20, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l

func _build_splash() -> void:
	splash = Control.new()
	splash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.03, 0.06)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	splash.add_child(bg)
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	splash.add_child(box)
	var title := _label("NOVA MIRA", 56, Color(0.22, 0.92, 0.82))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var sub := _label("A NOVA STUDIO PRODUCTION", 18, Color(0.65, 0.72, 0.80))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)
	_splash_bar = ProgressBar.new()
	_splash_bar.custom_minimum_size = Vector2(420, 20)
	_splash_bar.max_value = 100.0
	box.add_child(_splash_bar)
	_splash_tip = _label(loc.tr_text("TIP"), 15, Color(0.7, 0.8, 0.85))
	_splash_tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_splash_tip)
	root.add_child(splash)

func set_loading(progress: float, text: String) -> void:
	if _splash_bar != null:
		_splash_bar.value = clampf(progress, 0, 1) * 100.0
	if _splash_tip != null and not text.is_empty():
		_splash_tip.text = text

func show_game() -> void:
	splash.visible = false
	menu.visible = false
	hud.visible = true

func show_menu() -> void:
	splash.visible = false
	menu.visible = true
	hud.visible = false
	overlay.visible = false

func _build_menu() -> void:
	menu = Control.new()
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.07, 0.42)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(dim)
	var panel := _panel()
	panel.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	panel.anchor_right = 0.38
	panel.offset_right = -30
	panel.offset_left = 30
	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(vbox)
	var title := _label("NOVA MIRA", 48, Color(0.22, 0.92, 0.82))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)
	vbox.add_child(_label("Original open-world action", 16, Color(0.7, 0.78, 0.85)))
	vbox.add_child(_button("NEW_GAME", func(): start_requested.emit(true)))
	vbox.add_child(_button("CONTINUE", func(): start_requested.emit(false)))
	vbox.add_child(_button("MISSIONS", _open_missions))
	vbox.add_child(_button("STORE", _open_shop))
	vbox.add_child(_button("SETTINGS", _open_settings))
	vbox.add_child(_button("ACHIEVEMENTS", _open_achievements))
	vbox.add_child(_button("QUIT", func(): quit_requested.emit()))
	var lang_row := HBoxContainer.new()
	lang_row.add_child(_button("ARABIC", func(): locale_requested.emit("ar")))
	lang_row.add_child(_button("ENGLISH", func(): locale_requested.emit("en")))
	vbox.add_child(lang_row)
	menu.add_child(panel)
	root.add_child(menu)

func _build_hud() -> void:
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var top := PanelContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_LEFT)
	top.offset_left = 14; top.offset_top = 14; top.offset_right = 330; top.offset_bottom = 150
	var tv := VBoxContainer.new()
	top.add_child(tv)
	_hp = ProgressBar.new()
	_hp.max_value = 100.0; _hp.value = 100.0
	tv.add_child(_hp)
	_armour = ProgressBar.new()
	_armour.max_value = 100.0
	tv.add_child(_armour)
	_money_label = _label("$500", 22, Color(1, 0.85, 0.35))
	tv.add_child(_money_label)
	_stars_label = _label("", 20, Color(1, 0.6, 0.2))
	tv.add_child(_stars_label)
	hud.add_child(top)
	_mission_title = _label("", 18)
	_mission_title.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_mission_title.position = Vector2(340, 16)
	hud.add_child(_mission_title)
	_objective_label = _label("", 16, Color(0.78, 0.88, 0.94))
	_objective_label.position = Vector2(340, 44)
	hud.add_child(_objective_label)
	_time_label = _label("18:00", 18)
	_time_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_time_label.position = Vector2(-260, 16)
	hud.add_child(_time_label)
	_weather_label = _label("", 16, Color(0.72, 0.86, 0.95))
	_weather_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_weather_label.position = Vector2(-260, 44)
	hud.add_child(_weather_label)
	_weapon_label = _label("P-9  12/12", 22, Color(1, 1, 1))
	_weapon_label.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_weapon_label.position = Vector2(-250, -80)
	hud.add_child(_weapon_label)
	_toast_label = _label("", 20, Color(0.3, 1.0, 0.8))
	_toast_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toast_label.position = Vector2(-200, 110)
	hud.add_child(_toast_label)
	_fps_label = _label("", 14, Color(0.7, 0.8, 0.9))
	_fps_label.position = Vector2(16, 160)
	hud.add_child(_fps_label)
	_drive_panel = Control.new()
	_drive_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_drive_panel.position = Vector2(-330, -160)
	_speed_label = _label("0 km/h", 30, Color(0.3, 1.0, 0.9))
	_drive_panel.add_child(_speed_label)
	_drive_panel.visible = false
	hud.add_child(_drive_panel)
	_build_touch_controls()
	var mini := Minimap.new()
	mini.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	mini.position = Vector2(-210, 70)
	mini.custom_minimum_size = Vector2(180, 180)
	mini.name = "Minimap"
	hud.add_child(mini)
	root.add_child(hud)

func _build_touch_controls() -> void:
	_joystick = VirtualJoystick.new()
	(_joystick as VirtualJoystick).setup(input)
	_joystick.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_joystick.position = Vector2(40, -190)
	_joystick.custom_minimum_size = Vector2(150, 150)
	hud.add_child(_joystick)
	_touch_button("JUMP", "jump", Vector2(-330, -110), false)
	_touch_button("SHOOT", "attack", Vector2(-150, -190), false)
	_touch_button("AIM", "aim", Vector2(-230, -280), false)
	_touch_button("VEHICLE", "enter_vehicle", Vector2(-240, -100), true)
	_touch_button("RELOAD", "reload", Vector2(-400, -210), true)
	_touch_button("PHONE", "phone_toggle", Vector2(-80, -300), true)
	_touch_button("MAP", "map_toggle", Vector2(-80, -380), true)
	_touch_button("DRIVE", "sprint", Vector2(-430, -300), false)

func _touch_button(text: String, action: String, pos: Vector2, tap: bool) -> void:
	var b := Button.new()
	b.text = loc.tr_text(text)
	b.custom_minimum_size = Vector2(96, 64)
	b.position = pos
	b.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	b.position = pos
	b.focus_mode = Control.FOCUS_NONE
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.08, 0.16, 0.22, 0.72)
	s.set_corner_radius_all(24)
	b.add_theme_stylebox_override("normal", s)
	if tap:
		b.pressed.connect(func(): input.press(action); input.release(action))
	else:
		b.button_down.connect(func(): input.press(action))
		b.button_up.connect(func(): input.release(action))
		hud.add_child(b)

func _build_overlays() -> void:
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.visible = false
	root.add_child(overlay)
	pause = _make_overlay_panel("PAUSE")
	var pv := pause.get_child(1).get_child(0) as VBoxContainer
	pv.add_child(_button("RESUME", _close_overlays))
	pv.add_child(_button("SAVE", func(): save_requested.emit()))
	pv.add_child(_button("SETTINGS", _open_settings))
	pv.add_child(_button("QUIT", func(): quit_requested.emit()))
	phone = _make_overlay_panel("PHONE")
	var hv := phone.get_child(1).get_child(0) as VBoxContainer
	hv.add_child(_button("MESSAGES", func(): show_toast("Nova Mira: the harbour deal is still on.")))
	hv.add_child(_button("MAP", _close_overlays))
	hv.add_child(_button("JOBS", _open_missions))
	hv.add_child(_button("CLOSE", _close_overlays))
	shop_panel = _make_overlay_panel("STORE")
	var sv := shop_panel.get_child(1).get_child(0) as VBoxContainer
	for item in Economy.SHOP_ITEMS:
		var id := String(item["id"])
		sv.add_child(_button("%s  $%d" % [loc.tr_text(String(item["name"])), int(item["price"])], func(): shop_requested.emit(id)))
	sv.add_child(_button("CLOSE", _close_overlays))
	settings_panel = _make_overlay_panel("SETTINGS")
	var ev := settings_panel.get_child(1).get_child(0) as VBoxContainer
	ev.add_child(_button("QUALITY: LOW", func(): quality_requested.emit(0)))
	ev.add_child(_button("QUALITY: MEDIUM", func(): quality_requested.emit(1)))
	ev.add_child(_button("QUALITY: HIGH", func(): quality_requested.emit(2)))
	var slider := HSlider.new()
	slider.min_value = 0.2; slider.max_value = 2.0; slider.value = 1.0
	slider.custom_minimum_size = Vector2(260, 30)
	slider.value_changed.connect(func(v): input.sensitivity = v)
	ev.add_child(_label("SENSITIVITY", 16))
	ev.add_child(slider)
	ev.add_child(_button("ARABIC", func(): locale_requested.emit("ar")))
	ev.add_child(_button("ENGLISH", func(): locale_requested.emit("en")))
	ev.add_child(_button("CLOSE", _close_overlays))
	mission_panel = _make_overlay_panel("MISSIONS")
	var mv := mission_panel.get_child(1).get_child(0) as VBoxContainer
	for i in range(9):
		var idx := i
		mv.add_child(_button("MISSION %d" % (idx + 1), func(): mission_requested.emit(idx)))
	mv.add_child(_button("CLOSE", _close_overlays))

func _make_overlay_panel(title: String) -> Control:
	var c := Control.new()
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	c.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	c.add_child(dim)
	var panel := _panel()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -260; panel.offset_right = 260
	panel.offset_top = -320; panel.offset_bottom = 320
	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(vbox)
	vbox.add_child(_label(loc.tr_text(title), 30, Color(0.3, 0.95, 0.85)))
	c.add_child(panel)
	overlay.add_child(c)
	return c

func _open_missions() -> void:
	_show_one(mission_panel)

func _open_shop() -> void:
	_show_one(shop_panel)

func _open_settings() -> void:
	_show_one(settings_panel)

func _open_achievements() -> void:
	show_toast("Achievements: 3 of 12 unlocked")
	_close_overlays()

func _show_one(panel: Control) -> void:
	overlay.visible = true
	for p in [pause, phone, shop_panel, settings_panel, mission_panel]:
		(p as Control).visible = (p == panel)

func _close_overlays() -> void:
	overlay.visible = false
	for p in [pause, phone, shop_panel, settings_panel, mission_panel]:
		(p as Control).visible = false

func toggle_pause() -> void:
	if overlay.visible and pause.visible:
		_close_overlays()
	else:
		_show_one(pause)

func toggle_phone() -> void:
	if overlay.visible and phone.visible:
		_close_overlays()
	else:
		_show_one(phone)

func show_toast(text: String) -> void:
	_toast_label.text = text
	_toast_timer = 4.0

func update(delta: float) -> void:
	if _toast_timer > 0.0:
		_toast_timer -= delta
		if _toast_timer <= 0.0:
			_toast_label.text = ""
	if player != null and player.in_vehicle and player.current_vehicle != null:
		_speed_label.text = "%d km/h" % int((player.current_vehicle as VehicleController).speed_kmh)
	var mini := hud.get_node_or_null("Minimap") as Minimap
	if mini != null:
		mini.queue_redraw()

func refresh_locale() -> void:
	_apply_rtl()
	_splash_tip.text = loc.tr_text("TIP")

func set_hud_data(hp: float, armour: float, money: int, stars: int, weapon: String, ammo: int) -> void:
	if _hp != null:
		_hp.value = hp
		_armour.value = armour
		_money_label.text = "$%d" % money
		_stars_label.text = "★".repeat(stars) + "☆".repeat(5 - stars)
		_weapon_label.text = "%s  %d" % [weapon, ammo]

func _on_money(v: int) -> void:
	_money_label.text = "$%d" % v

func _on_health(hp: float, armour: float) -> void:
	_hp.value = hp
	_armour.value = armour

func _on_stars(n: int) -> void:
	_stars_label.text = "★".repeat(n) + "☆".repeat(5 - n)

func _on_weapon(name: String, ammo: int, _reserve: int) -> void:
	_weapon_label.text = "%s  %d" % [name, ammo]

func _on_mission(title: String, objective: String) -> void:
	_mission_title.text = title
	_objective_label.text = objective

func _on_time(hour: float) -> void:
	_time_label.text = "%02d:%02d" % [int(hour), int((hour - floor(hour)) * 60.0)]

func _on_weather(_state: int) -> void:
	if weather != null:
		_weather_label.text = weather.label(loc.locale)

func _on_vehicle_state(in_vehicle: bool) -> void:
	_drive_panel.visible = in_vehicle

func _on_arrested() -> void:
	show_toast("ARRESTED: " + loc.tr_text("ARRESTED_MSG"))

func _on_fps(fps: float) -> void:
	if _show_fps:
		_fps_label.text = "%d FPS" % int(fps)

func set_fps_visible(v: bool) -> void:
	_show_fps = v
	_fps_label.visible = v
