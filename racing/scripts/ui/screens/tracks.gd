extends "res://scripts/ui/ScreenBase.gd"
## Track + mode selection. A rotating coverflow of track cards with live art,
## mode pills, and a detail panel with start button.

var _mode := "circuit"
var _sel := 0
var _cards: Array = []
var _detail: VBoxContainer
var _mode_row: HBoxContainer
var _start_btn: Button


func build() -> void:
	top_bar(Localization.t("tracks.title"))
	_build_mode_row()
	_build_coverflow()
	_build_detail()
	_refresh()


func _build_mode_row() -> void:
	_mode_row = HBoxContainer.new()
	_mode_row.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_mode_row.offset_left = 96
	_mode_row.offset_right = -96
	_mode_row.offset_top = 168
	_mode_row.offset_bottom = 252
	_mode_row.add_theme_constant_override("separation", 14)
	content.add_child(_mode_row)
	var idx := 0
	for mode in ["circuit", "trial", "drag"]:
		var label := Localization.t("mode.circuit" if mode == "circuit" else ("mode.trial" if mode == "trial" else "mode.drag"))
		var b := UIStyle.make_button(label, UIStyle.CYAN, mode == _mode, 24, 66)
		b.custom_minimum_size = Vector2(240, 66)
		var m := mode
		b.pressed.connect(func(): _set_mode(m))
		_mode_row.add_child(b)
		idx += 1


func _set_mode(mode: String) -> void:
	_mode = mode
	for i in range(_mode_row.get_child_count()):
		var b: Button = _mode_row.get_child(i)
		var m := ["circuit", "trial", "drag"][i]
		b.add_theme_stylebox_override("normal", UIStyle.glass_box(20, Color(0.09, 0.13, 0.22, 0.66), 0.22))
		if m == _mode:
			b.add_theme_stylebox_override("normal", UIStyle.accent_box(UIStyle.CYAN, 0.3, 20, 0.4))
	_refresh()


func _build_coverflow() -> void:
	var strip := HBoxContainer.new()
	strip.set_anchors_preset(Control.PRESET_TOP_WIDE)
	strip.offset_left = 96
	strip.offset_right = -96
	strip.offset_top = 286
	strip.offset_bottom = 690
	strip.add_theme_constant_override("separation", 22)
	content.add_child(strip)
	for i in range(4):
		var card := _make_card(i)
		strip.add_child(card)
		_cards.append(card)
	var left := UIStyle.make_icon_button("back", 68, UIStyle.CYAN)
	left.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	left.offset_left = 14
	left.offset_right = 82
	left.offset_top = 430
	left.offset_bottom = 498
	left.pressed.connect(func(): _step(-1))
	content.add_child(left)
	var right := UIStyle.make_icon_button("play", 68, UIStyle.CYAN)
	right.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	right.offset_left = -82
	right.offset_right = -14
	right.offset_top = 430
	right.offset_bottom = 498
	right.pressed.connect(func(): _step(1))
	content.add_child(right)


func _make_card(i: int) -> Control:
	var holder := Control.new()
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	holder.custom_minimum_size = Vector2(0, 404)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.clip_contents = true
	holder.add_child(panel)
	var art := TextureRect.new()
	art.name = "Art"
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(art)
	var grad := TextureRect.new()
	grad.texture = UIStyle.gradient_tex(Color(0.02, 0.03, 0.06, 0.0), Color(0.01, 0.015, 0.03, 0.98), 10)
	grad.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	grad.stretch_mode = TextureRect.STRETCH_SCALE
	grad.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(grad)
	var info := VBoxContainer.new()
	info.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	info.offset_left = 26
	info.offset_right = -26
	info.offset_top = -142
	info.offset_bottom = -18
	info.add_theme_constant_override("separation", 2)
	panel.add_child(info)
	var kicker := UIStyle.make_kicker("", UIStyle.CYAN, 15)
	kicker.name = "Kicker"
	info.add_child(kicker)
	var name_lbl := UIStyle.make_title("", 34, Color.WHITE)
	name_lbl.name = "Name"
	info.add_child(name_lbl)
	var meta := UIStyle.make_label("", "body", 20, UIStyle.TEXT_DIM)
	meta.name = "Meta"
	info.add_child(meta)
	var lock := UIStyle.make_chip(Localization.t("common.locked"), UIStyle.RED, 16)
	lock.name = "Lock"
	lock.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	lock.offset_left = -180
	lock.offset_right = -18
	lock.offset_top = 18
	lock.offset_bottom = 60
	panel.add_child(lock)
	var btn := Button.new()
	btn.flat = true
	btn.set_anchors_preset(Control.PRESET_FULL_RECT)
	btn.focus_mode = Control.FOCUS_NONE
	btn.pressed.connect(func(): _select(i))
	panel.add_child(btn)
	return holder


func _step(dir: int) -> void:
	_sel = (_sel + dir + 4) % 4
	AudioDirector.play_sfx("ui_hover", -8.0)
	_refresh()


func _select(i: int) -> void:
	if i != _sel:
		_sel = i
		AudioDirector.play_sfx("ui_click", -6.0)
		_refresh()
	else:
		_start()


func _page() -> int:
	return int(_sel / 4)


func _refresh() -> void:
	var tracks: Array = GameData.TRACKS
	var base := (_sel - _sel % 4)
	for i in range(4):
		var idx := (base + i) % tracks.size()
		var track: Dictionary = tracks[idx]
		var card: Control = _cards[i]
		var panel: PanelContainer = card.get_child(0)
		var art: TextureRect = panel.get_node("Art")
		var art_name := str(track.get("art", "city_night"))
		art.texture = UIStyle.art(art_name)
		if art.texture == null:
			art.texture = UIStyle.art("menu_hero")
		var kicker: Label = card.find_child("Kicker", true, false)
		kicker.text = str(track.get("env", "")).to_upper() + "  ·  " + str(track.get("time", "")).to_upper()
		var name_lbl: Label = card.find_child("Name", true, false)
		name_lbl.text = str(track["name"])
		var meta: Label = card.find_child("Meta", true, false)
		meta.text = "%.1f KM  ·  %d LAPS  ·  %s" % [float(track["length"]), int(track.get("laps", 3)),
			str(track.get("time", "")).to_upper()]
		var lock: Control = card.find_child("Lock", true, false)
		lock.visible = not _unlocked(track)
		var selected := idx == _sel
		card.pivot_offset = card.size * 0.5
		var tw := create_tween()
		tw.set_parallel(true)
		tw.tween_property(card, "modulate", Color(1, 1, 1, 1) if selected else Color(0.72, 0.76, 0.86, 1.0), 0.2)
		tw.tween_property(card, "scale", Vector2(1, 1) if selected else Vector2(0.965, 0.965), 0.22)
		var sb := UIStyle.glass_box(30, Color(0.06, 0.09, 0.16, 0.82),
			0.62 if selected else 0.15, 0.55 if selected else 0.0)
		panel.add_theme_stylebox_override("panel", sb)
	_refresh_detail()


func _unlocked(track: Dictionary) -> bool:
	return Game.level() >= int(track.get("unlock", 1))


func _build_detail() -> void:
	var panel := UIStyle.make_glass_panel(30, Color(0.04, 0.06, 0.11, 0.86), 30, 0.2)
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_left = 96
	panel.offset_right = -96
	panel.offset_top = -300
	panel.offset_bottom = -40
	content.add_child(panel)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 40)
	panel.add_child(h)
	_detail = VBoxContainer.new()
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail.add_theme_constant_override("separation", 2)
	h.add_child(_detail)
	_start_btn = UIStyle.make_button(Localization.t("tracks.enter"), UIStyle.CYAN, true, 32, 92)
	_start_btn.custom_minimum_size = Vector2(360, 92)
	_start_btn.pressed.connect(_start)
	h.add_child(_start_btn)


func _refresh_detail() -> void:
	var track: Dictionary = GameData.TRACKS[_sel % GameData.TRACKS.size()]
	for c in _detail.get_children():
		c.queue_free()
	_detail.add_child(UIStyle.make_kicker(str(track.get("env", "")).to_upper() + " / " + _mode.to_upper(), UIStyle.CYAN, 14))
	_detail.add_child(UIStyle.make_title(str(track["name"]), 48, UIStyle.CYAN))
	_detail.add_child(UIStyle.make_label(str(track.get("desc", "")), "body", 24, UIStyle.TEXT_DIM))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_detail.add_child(row)
	row.add_child(UIStyle.make_chip("%s KM" % "%.1f" % float(track["length"]), UIStyle.CYAN, 16))
	row.add_child(UIStyle.make_chip("%d LAPS" % int(track.get("laps", 3)), UIStyle.VIOLET, 16))
	row.add_child(UIStyle.make_chip(Localization.t("track.reward") + " " + fmt_credits(int(track.get("reward", 0))),
		UIStyle.GOLD, 16))
	var stars := int(track.get("difficulty", 1))
	row.add_child(UIStyle.make_chip("DIFF " + "●".repeat(stars), UIStyle.MAGENTA, 16))
	_start_btn.disabled = not _unlocked(track)


func _start() -> void:
	var track: Dictionary = GameData.TRACKS[_sel % GameData.TRACKS.size()]
	if not _unlocked(track):
		AudioDirector.play_sfx("ui_back", -4.0)
		return
	AudioDirector.play_sfx("ui_confirm", 0.0)
	go("race", {"track": track, "mode": _mode, "laps": 1 if _mode == "drag" else int(track.get("laps", 3))})
