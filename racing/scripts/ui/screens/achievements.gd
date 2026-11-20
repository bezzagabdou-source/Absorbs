extends "res://scripts/ui/ScreenBase.gd"
## Achievement board: progress summary, claimable highlight, full grid with
## locked/unlocked/claimed states.

func build() -> void:
	top_bar(Localization.t("menu.achievements"))
	_build_summary()
	_build_grid()


func _build_summary() -> void:
	var total = GameData.ACHIEVEMENTS.size()
	var unlocked = 0
	var claimable = 0
	for a in GameData.ACHIEVEMENTS:
		if Game.unlocked(str(a["id"])):
			unlocked += 1
			if not Game.claimed(str(a["id"])):
				claimable += 1
	var row = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	row.offset_left = 44
	row.offset_right = -44
	row.offset_top = 156
	row.offset_bottom = 268
	row.add_theme_constant_override("separation", 18)
	content.add_child(row)
	var p = UIStyle.make_glass_panel(24, Color(0.05, 0.08, 0.14, 0.8), 20, 0.2)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	p.add_child(v)
	v.add_child(UIStyle.make_kicker("UNLOCKED", UIStyle.TEXT_DIM, 14))
	v.add_child(UIStyle.make_numeral("%d / %d" % [unlocked, total], 44, UIStyle.CYAN))
	v.add_child(UIStyle.make_progress_bar(float(unlocked) / float(total) * 100.0, UIStyle.CYAN, 10))
	row.add_child(p)
	var p2 = UIStyle.make_glass_panel(24, Color(0.05, 0.08, 0.14, 0.8), 20, 0.2)
	p2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p2.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var v2 = VBoxContainer.new()
	v2.add_theme_constant_override("separation", 2)
	p2.add_child(v2)
	v2.add_child(UIStyle.make_kicker("READY TO CLAIM", UIStyle.TEXT_DIM, 14))
	var cnt = UIStyle.make_numeral(str(claimable), 44, UIStyle.GOLD if claimable > 0 else UIStyle.TEXT_DIM)
	v2.add_child(cnt)
	v2.add_child(UIStyle.make_label(Localization.t("profile.claim_all") if claimable > 0 else "—",
		"body", 18, UIStyle.TEXT_DIM))
	if claimable > 0:
		var claim_all = UIStyle.make_button(Localization.t("profile.claim_all"), UIStyle.GOLD, true, 20, 54)
		claim_all.pressed.connect(_claim_all)
		v2.add_child(claim_all)
	row.add_child(p2)


func _build_grid() -> void:
	var scroll = ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 44
	scroll.offset_right = -44
	scroll.offset_top = 290
	scroll.offset_bottom = -44
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(scroll)
	var grid = GridContainer.new()
	grid.columns = 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 18)
	grid.columns = 3
	grid.add_theme_constant_override("v_separation", 18)
	scroll.add_child(grid)
	for a in GameData.ACHIEVEMENTS:
		var card = _card(a)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(card)


func _card(a: Dictionary) -> Control:
	var id = str(a["id"])
	var unlocked = Game.unlocked(id)
	var claimed = Game.claimed(id)
	var p = UIStyle.make_glass_panel(24, Color(0.05, 0.08, 0.14, 0.78), 24,
		0.4 if (unlocked and not claimed) else 0.0)
	p.custom_minimum_size = Vector2(0, 176)
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 18)
	p.add_child(h)
	var badge = PanelContainer.new()
	badge.custom_minimum_size = Vector2(96, 96)
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var accent = UIStyle.GOLD if unlocked else Color(0.25, 0.28, 0.36)
	badge.add_theme_stylebox_override("panel", UIStyle.accent_box(accent, 0.22, 48,
		0.4 if unlocked and not claimed else 0.0))
	var ic = TextureRect.new()
	ic.texture = UIStyle.icon(str(a.get("icon", "trophy")))
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.modulate = Color.WHITE if unlocked else Color(0.4, 0.45, 0.55, 0.7)
	badge.add_child(ic)
	h.add_child(badge)
	var v = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	v.add_child(UIStyle.make_label(str(a["name"]), "bold", 28, Color.WHITE if unlocked else UIStyle.TEXT_DIM))
	v.add_child(UIStyle.make_label(str(a["desc"]), "body", 20, UIStyle.TEXT_DIM))
	v.add_child(UIStyle.make_label("REWARD " + fmt_credits(int(a["reward"])), "numeric", 18, UIStyle.GOLD))
	var btn = UIStyle.make_button(
		Localization.t("common.claim") if (unlocked and not claimed)
		else (Localization.t("common.owned") if claimed else "LOCKED"), accent, unlocked and not claimed, 18, 54)
	btn.disabled = not (unlocked and not claimed)
	btn.pressed.connect(func(): _claim(id))
	v.add_child(btn)
	return p


func _claim(id: String) -> void:
	if Game.claim_achievement(id):
		AudioDirector.play_sfx("achievement", -2.0)
		_rebuild()


func _claim_all() -> void:
	for a in Game.claimable_achievements():
		Game.claim_achievement(str(a))
	AudioDirector.play_sfx("achievement", 0.0)
	_rebuild()


func _rebuild() -> void:
	for c in content.get_children():
		c.queue_free()
	build()
