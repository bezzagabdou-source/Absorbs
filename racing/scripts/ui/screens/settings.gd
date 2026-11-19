extends "res://scripts/ui/ScreenBase.gd"
## Settings: graphics quality, render scale, motion blur, camera shake, FPS,
## audio buses, control scheme, tilt sensitivity/invert, assists, language,
## vibration and a destructive reset behind a confirm dialog.

const SECTIONS := ["graphics", "audio", "controls", "language", "data"]

var _tab = "graphics"
var _nav: VBoxContainer
var _body: VBoxContainer
var _tabs_col: VBoxContainer


func build() -> void:
	top_bar(Localization.t("settings.title"))
	_build_layout()
	_refresh_nav()
	_refresh_body()


func _build_layout() -> void:
	var nav_panel = UIStyle.make_glass_panel(24, Color(0.04, 0.06, 0.11, 0.82), 16)
	nav_panel.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	nav_panel.offset_left = 44
	nav_panel.offset_right = 364
	nav_panel.offset_top = 168
	nav_panel.offset_bottom = -44
	content.add_child(nav_panel)
	_tabs_col = VBoxContainer.new()
	_tabs_col.add_theme_constant_override("separation", 10)
	nav_panel.add_child(_tabs_col)
	var body_panel = UIStyle.make_glass_panel(26, Color(0.04, 0.06, 0.11, 0.86), 30)
	body_panel.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	body_panel.offset_left = 392
	body_panel.offset_right = -44
	body_panel.offset_top = 168
	body_panel.offset_bottom = -44
	content.add_child(body_panel)
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_panel.add_child(scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 14)
	scroll.add_child(_body)


func _refresh_nav() -> void:
	for c in _tabs_col.get_children():
		c.queue_free()
	for sec in SECTIONS:
		var label = ""
		if sec == "graphics":
			label = Localization.t("settings.graphics")
		elif sec == "audio":
			label = Localization.t("settings.audio")
		elif sec == "controls":
			label = Localization.t("settings.controls")
		elif sec == "language":
			label = Localization.t("settings.language")
		else:
			label = "DATA"
		var b = UIStyle.make_button(label, UIStyle.CYAN, sec == _tab, 22, 76)
		var s = sec
		b.pressed.connect(func(): _tab = s; _refresh_nav(); _refresh_body())
		_tabs_col.add_child(b)


func _refresh_body() -> void:
	for c in _body.get_children():
		c.queue_free()
	if _tab == "graphics":
		_graphics()
	elif _tab == "audio":
		_audio()
	elif _tab == "controls":
		_controls()
	elif _tab == "language":
		_language()
	else:
		_data()


func _header(text: String) -> void:
	_body.add_child(UIStyle.make_kicker(text, UIStyle.CYAN, 16))
	_body.add_child(UIStyle.make_rule())


func _row(label: String, hint: String = "") -> HBoxContainer:
	var p = UIStyle.make_glass_panel(18, Color(0.05, 0.08, 0.14, 0.62), 20)
	_body.add_child(p)
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 18)
	p.add_child(h)
	var v = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", -4)
	h.add_child(v)
	v.add_child(UIStyle.make_label(label, "bold", 26, Color.WHITE))
	if hint != "":
		v.add_child(UIStyle.make_label(hint, "body", 18, UIStyle.TEXT_DIM))
	return h


func _choice(h: HBoxContainer, options: Array, current: String, cb: Callable) -> void:
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	h.add_child(row)
	for opt in options:
		var b = UIStyle.make_button(str(opt).to_upper(), UIStyle.CYAN, str(opt) == current, 18, 56)
		b.custom_minimum_size = Vector2(136, 56)
		var o = str(opt)
		b.pressed.connect(func(): cb.call(o))
		row.add_child(b)


func _slider(h: HBoxContainer, value: float, cb: Callable) -> void:
	var v = VBoxContainer.new()
	v.custom_minimum_size = Vector2(440, 0)
	h.add_child(v)
	var s = HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.05
	s.value = value
	s.custom_minimum_size = Vector2(440, 34)
	var lbl = UIStyle.make_label("%d%%" % int(round(value * 100.0)), "numeric", 20, UIStyle.CYAN)
	v.add_child(s)
	v.add_child(lbl)
	s.value_changed.connect(func(val: float):
		lbl.text = "%d%%" % int(round(val * 100.0))
		cb.call(val)
		)


func _toggle(h: HBoxContainer, value: bool, cb: Callable) -> void:
	var t = UIStyle.make_toggle(value, UIStyle.CYAN)
	h.add_child(t)
	t.toggled.connect(func(on: bool): cb.call(on))


func _graphics() -> void:
	_header(Localization.t("settings.graphics"))
	var quality = str(SettingsStore.get_value("quality", "high"))
	_choice(_row(Localization.t("settings.quality"), "Resolution scale, MSAA, shadows, draw distance"),
		["low", "medium", "high", "ultra"], quality, func(v):
			SettingsStore.set_value("quality", v)
			SettingsStore.apply("quality", v)
			_refresh_body())
	_choice(_row(Localization.t("settings.resolution"), "3D render resolution"),
		["0.6", "0.75", "0.9", "1.0"], str(SettingsStore.get_value("render_scale", 1.0)), func(v):
			SettingsStore.set_value("render_scale", float(v))
			_refresh_body())
	_toggle(_row(Localization.t("settings.blur"), "Speed blur and camera radial streaks"),
		bool(SettingsStore.get_value("motion_blur", true)), func(v):
			SettingsStore.set_value("motion_blur", v))
	_toggle(_row(Localization.t("settings.shake"), "Impact and nitro camera shake"),
		bool(SettingsStore.get_value("camera_shake", true)), func(v):
			SettingsStore.set_value("camera_shake", v))
	_toggle(_row(Localization.t("settings.fps"), "Show frame counter in race"),
		bool(SettingsStore.get_value("show_fps", false)), func(v):
			SettingsStore.set_value("show_fps", v))


func _audio() -> void:
	_header(Localization.t("settings.audio"))
	_slider(_row(Localization.t("settings.music")), float(SettingsStore.get_value("music", 0.7)), func(v):
		SettingsStore.set_value("music", v)
		SettingsStore.apply("music", v))
	_slider(_row(Localization.t("settings.sfx")), float(SettingsStore.get_value("sfx", 0.85)), func(v):
		SettingsStore.set_value("sfx", v)
		SettingsStore.apply("sfx", v))
	_slider(_row(Localization.t("settings.engine")), float(SettingsStore.get_value("engine", 0.8)), func(v):
		SettingsStore.set_value("engine", v)
		SettingsStore.apply("engine", v))


func _controls() -> void:
	_header(Localization.t("settings.controls"))
	var mode = str(SettingsStore.get_value("steer_mode", "buttons"))
	_choice(_row(Localization.t("settings.steer"), "How you steer the car"),
		["tilt", "buttons", "wheel"], mode, func(v):
			SettingsStore.set_value("steer_mode", v)
			_refresh_body())
	_slider(_row(Localization.t("settings.sensitivity")), float(SettingsStore.get_value("sensitivity", 1.0)) / 3.0,
		func(v): SettingsStore.set_value("sensitivity", v * 3.0))
	_toggle(_row(Localization.t("settings.invert"), "Flip tilt steering direction"),
		bool(SettingsStore.get_value("invert_tilt", false)), func(v):
			SettingsStore.set_value("invert_tilt", v))
	_toggle(_row(Localization.t("settings.assist"), "Stability assist on corners and recovery"),
		bool(SettingsStore.get_value("assist", true)), func(v):
			SettingsStore.set_value("assist", v))
	_toggle(_row("VIBRATION", "Haptic feedback on impacts and nitro"),
		bool(SettingsStore.get_value("vibration", true)), func(v):
			SettingsStore.set_value("vibration", v))


func _language() -> void:
	_header(Localization.t("settings.language"))
	for lang in [["en", "ENGLISH"], ["fr", "FRANÇAIS"], ["ar", "العربية"]]:
		var current = str(SettingsStore.get_value("language", "en")) == lang[0]
		var b = UIStyle.make_button(lang[1], UIStyle.CYAN, current, 26, 82)
		var code = str(lang[0])
		b.pressed.connect(func():
			SettingsStore.set_value("language", code)
			SettingsStore.apply("language", code)
			Localization.set_language(code)
			router.goto("settings", {}, false)
			)
		_body.add_child(b)


func _data() -> void:
	_header("PROFILE")
	var st: Dictionary = Game.data.get("stats", {})
	var p = UIStyle.make_glass_panel(20, Color(0.05, 0.08, 0.14, 0.62), 22)
	_body.add_child(p)
	var grid = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 60)
	grid.add_theme_constant_override("v_separation", 6)
	p.add_child(grid)
	var rows = [
		["RACES", str(int(st.get("races", 0)))],
		["WINS", str(int(st.get("wins", 0)))],
		["PODIUMS", str(int(st.get("podiums", 0)))],
		["TOP SPEED", "%.0f KM/H" % float(st.get("top_speed", 0.0))],
		["DISTANCE", "%.1f KM" % float(st.get("distance_km", 0.0))],
		["CARS OWNED", "%d / %d" % [Game.owned_count(), GameData.CARS.size()]],
	]
	for r in rows:
		grid.add_child(UIStyle.make_kicker(r[0], UIStyle.TEXT_DIM, 16))
		grid.add_child(UIStyle.make_label(r[1], "numeric", 24, Color.WHITE))
	_header("RESET")
	_body.add_child(UIStyle.make_label(Localization.t("settings.reset_confirm"), "body", 20, UIStyle.TEXT_DIM))
	var reset = UIStyle.make_button(Localization.t("settings.reset"), UIStyle.RED, false, 24, 84)
	reset.pressed.connect(_confirm_reset)
	_body.add_child(reset)


func _confirm_reset() -> void:
	var d = ConfirmationDialog.new()
	d.title = Localization.t("settings.reset")
	d.dialog_text = Localization.t("settings.reset_confirm")
	d.ok_button_text = Localization.t("settings.reset")
	d.cancel_button_text = Localization.t("common.cancel")
	d.confirmed.connect(func():
		Game.reset_progress()
		AudioDirector.play_sfx("ui_back", -2.0)
		_refresh_body()
		)
	add_child(d)
	d.popup_centered()
	d.get_ok_button().add_theme_stylebox_override("normal", UIStyle.accent_box(UIStyle.RED, 0.3, 14))
	d.get_cancel_button().add_theme_stylebox_override("normal", UIStyle.glass_box(14))
