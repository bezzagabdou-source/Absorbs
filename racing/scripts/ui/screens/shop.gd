extends "res://scripts/ui/ScreenBase.gd"
## Dealership: buy cars with credits. Filter by class, live stat comparison
## against the currently selected car, and locked-by-level states.

const CarViewerScript = preload("res://scripts/ui/CarViewer3D.gd")

var _filter = "all"
var _grid: GridContainer
var _compare: VBoxContainer
var _focus_id = ""


func build() -> void:
	top_bar(Localization.t("shop.title"))
	_build_filters()
	_build_grid()
	_build_compare()
	var first = ""
	for car in GameData.CARS:
		if not Game.owns(str(car["id"])) and Game.level() >= int(car.get("unlock", 0)):
			first = str(car["id"])
			break
	_focus_id = first if first != "" else Game.selected_car_id()
	_refresh()


func _build_filters() -> void:
	var row = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	row.offset_left = 96
	row.offset_right = -740
	row.offset_top = 168
	row.offset_bottom = 248
	row.add_theme_constant_override("separation", 12)
	content.add_child(row)
	for cls in ["all"] + GameData.CLASSES:
		var b = UIStyle.make_button(cls.to_upper(), UIStyle.CYAN, cls == _filter, 20, 62)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var c = cls
		b.pressed.connect(func(): _set_filter(c))
		b.set_meta("cls", cls)
		row.add_child(b)


func _set_filter(cls: String) -> void:
	_filter = cls
	var row = _filter_row()
	for i in range(row.get_child_count()):
		var b: Button = row.get_child(i)
		var m = str(b.get_meta("cls", ""))
		b.add_theme_stylebox_override("normal", UIStyle.glass_box(18, Color(0.08, 0.12, 0.2, 0.7), 0.15))
		if m == cls:
			b.add_theme_stylebox_override("normal", UIStyle.accent_box(UIStyle.CYAN, 0.3, 18, 0.4))
	_refresh()


func _filter_row() -> HBoxContainer:
	for c in content.get_children():
		if c is HBoxContainer and c.offset_top == 168:
			return c
	return HBoxContainer.new()


func _build_grid() -> void:
	var scroll = ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	scroll.offset_left = 96
	scroll.offset_top = 268
	scroll.offset_bottom = -44
	scroll.offset_right = 1180
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(scroll)
	_grid = GridContainer.new()
	_grid.columns = 3
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 18)
	_grid.add_theme_constant_override("v_separation", 18)
	scroll.add_child(_grid)


func _build_compare() -> void:
	var panel = UIStyle.make_glass_panel(30, Color(0.04, 0.06, 0.11, 0.86), 28, 0.2)
	panel.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	panel.offset_left = -696
	panel.offset_right = -44
	panel.offset_top = 168
	panel.offset_bottom = -44
	content.add_child(panel)
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	_compare = VBoxContainer.new()
	_compare.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_compare.add_theme_constant_override("separation", 10)
	scroll.add_child(_compare)


func _refresh() -> void:
	for c in _grid.get_children():
		c.queue_free()
	for car in GameData.CARS:
		if _filter != "all" and str(car["class"]) != _filter:
			continue
		_grid.add_child(_card(car))
	_refresh_compare()


func _card(car: Dictionary) -> Control:
	var cls_color: Color = GameData.CLASS_INFO[str(car["class"])]["color"]
	var owned = Game.owns(str(car["id"]))
	var unlocked = Game.level() >= int(car.get("unlock", 0))
	var panel = PanelContainer.new()
	panel.custom_minimum_size = Vector2(336, 396)
	panel.add_theme_stylebox_override("panel", UIStyle.glass_box(22, Color(0.05, 0.08, 0.14, 0.78),
		0.3 if str(car["id"]) == _focus_id else 0.12, 0.25 if str(car["id"]) == _focus_id else 0.0))
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	panel.add_child(v)
	# A real car instead of a colour dot. It is static unless the card is the
	# focused one, because a grid of nine spinning viewports is nine render
	# passes for something the player is not looking at.
	#
	# The card's 372 px has to cover a name, a class kicker, two stat bars and a
	# price row, which is about 190 px of text. The old 172 px preview therefore
	# overflowed and the layout silently squeezed every child, including the
	# car, which is why the showroom cars came out thumbnail-sized with a band of
	# empty glass above and below them.
	var preview = CarViewerScript.new()
	preview.custom_minimum_size = Vector2(0, 196)
	preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if preview.setup():
		preview.auto_spin = str(car["id"]) == _focus_id
		preview.show_car(car)
		v.add_child(preview)
	else:
		# no 3D context: keep the accent stripe so the card still has colour
		var dot = ColorRect.new()
		dot.color = Color(str(car["color"]))
		dot.custom_minimum_size = Vector2(0, 6)
		v.add_child(dot)

	var head = HBoxContainer.new()
	v.add_child(head)
	var name_lbl = UIStyle.make_label(str(car["name"]), "bold", 26, Color.WHITE)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(name_lbl)
	v.add_child(UIStyle.make_kicker(str(GameData.CLASS_INFO[str(car["class"])]["label"]) + "  ·  " +
		str(car["brand"]), cls_color, 13))
	v.add_child(UIStyle.make_stat_bar(Localization.t("common.speed"), float(car["stats"]["speed"]), UIStyle.CYAN, 8, 280, false))
	v.add_child(UIStyle.make_stat_bar(Localization.t("common.accel"), float(car["stats"]["accel"]),
		UIStyle.MAGENTA, 8, 280, false))
	var foot = HBoxContainer.new()
	foot.add_theme_constant_override("separation", 8)
	v.add_child(foot)
	var price = UIStyle.make_label(Localization.t("common.owned") if owned else fmt_credits(int(car["price"])),
		"numeric", 22, UIStyle.LIME if owned else UIStyle.GOLD)
	price.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(price)
	if not unlocked and not owned:
		foot.add_child(UIStyle.make_chip("LV %d" % int(car.get("unlock", 0)), UIStyle.RED, 14))
	elif owned:
		foot.add_child(UIStyle.make_chip("✓", UIStyle.LIME, 14))
	else:
		var buy = UIStyle.make_button(Localization.t("common.buy"), UIStyle.CYAN, true, 18, 52)
		buy.custom_minimum_size = Vector2(110, 52)
		var cid = str(car["id"])
		buy.pressed.connect(func(): _buy(cid))
		foot.add_child(buy)
	panel.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_focus_id = str(car["id"])
			AudioDirector.play_sfx("ui_hover", -12.0)
			_refresh()
		)
	return panel


func _buy(car_id: String) -> void:
	if Game.buy_car(car_id):
		AudioDirector.play_sfx("purchase", 0.0)
		AudioDirector.play_sfx("achievement", -6.0)
		_refresh()
	else:
		AudioDirector.play_sfx("ui_back", -4.0)


func _refresh_compare() -> void:
	for c in _compare.get_children():
		c.queue_free()
	var car = GameData.car_by_id(_focus_id)
	if car.is_empty():
		car = GameData.CARS[0]
	var current = Game.selected_car()
	var cls_color: Color = GameData.CLASS_INFO[str(car["class"])]["color"]
	_compare.add_child(UIStyle.make_kicker(Localization.t("common.stats"), cls_color, 15))
	_compare.add_child(UIStyle.make_title(str(car["name"]), 52, cls_color))
	_compare.add_child(UIStyle.make_label(str(car["brand"]) + "  ·  " + str(GameData.CLASS_INFO[str(car["class"])]["label"]),
		"body", 22, UIStyle.TEXT_DIM))
	var st: Dictionary = car["stats"]
	var cur_st: Dictionary = current["stats"] if not current.is_empty() else st
	var labels = [["speed", Localization.t("common.speed"), UIStyle.CYAN], ["accel", Localization.t("common.accel"), UIStyle.MAGENTA],
		["handling", Localization.t("common.handling"), UIStyle.LIME], ["brake", Localization.t("common.brake"), UIStyle.AMBER],
		["nitro", Localization.t("common.nitro"), UIStyle.VIOLET]]
	for item in labels:
		var row = VBoxContainer.new()
		var head = HBoxContainer.new()
		var lbl = UIStyle.make_label(item[1], "kicker", 15, UIStyle.TEXT_DIM)
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(lbl)
		var delta = float(st[item[0]]) - float(cur_st[item[0]])
		var dsign = "+" if delta >= 0.0 else ""
		var dcolor = UIStyle.LIME if delta > 0.0 else (UIStyle.RED if delta < 0.0 else UIStyle.TEXT_DIM)
		head.add_child(UIStyle.make_label("%s%d" % [dsign, int(delta)], "numeric", 16, dcolor))
		row.add_child(head)
		row.add_child(UIStyle.make_progress_bar(float(st[item[0]]), item[2], 10))
		_compare.add_child(row)
	var perf = UIStyle.make_glass_panel(18, Color(0.05, 0.09, 0.15, 0.6), 18)
	var pv = VBoxContainer.new()
	perf.add_child(pv)
	pv.add_child(UIStyle.make_kicker("PERFORMANCE", UIStyle.TEXT_DIM, 13))
	pv.add_child(UIStyle.make_label("TOP %.0f KM/H" % lerpf(168.0, 412.0,
		pow(float(st["speed"]) / 100.0, 1.35)), "numeric", 26, Color.WHITE))
	pv.add_child(UIStyle.make_label("RATING  %d" % _rating(st), "numeric", 26, UIStyle.GOLD))
	_compare.add_child(perf)
	var note_text = ""
	if int(car.get("unlock", 0)) > Game.level():
		note_text = Localization.trf("tracks.locked", [int(car.get("unlock", 0))])
	var note = UIStyle.make_label(note_text, "body", 18, UIStyle.RED)
	_compare.add_child(note)


func _rating(st: Dictionary) -> int:
	return int((float(st["speed"]) + float(st["accel"]) + float(st["handling"]) + float(st["brake"]) +
		float(st["nitro"])) / 5.0)
