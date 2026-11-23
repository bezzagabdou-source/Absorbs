extends "res://scripts/ui/ScreenBase.gd"
## Daily login rewards: 7-day streak track with claim state and countdown to
## the next reset.

var _streak_row: HBoxContainer
var _status: Label


func build() -> void:
	top_bar(Localization.t("daily.title"))
	Missions.ensure_missions(Game.data)
	_build_hero()
	_build_streak()
	_build_claim()
	_build_missions()


func _build_hero() -> void:
	var art = UIStyle.make_art_background("menu_hero")
	art.modulate.a = 0.35
	content.add_child(art)
	content.move_child(art, 0)
	var v = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	v.offset_left = 96
	v.offset_right = -96
	v.offset_top = 160
	v.offset_bottom = 400
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	content.add_child(v)
	v.add_child(UIStyle.make_kicker(Localization.t("daily.bonus"), UIStyle.GOLD, 20))
	var title = UIStyle.make_title(Localization.t("menu.daily") + " REWARDS", 88, UIStyle.GOLD,
		HORIZONTAL_ALIGNMENT_CENTER)
	v.add_child(title)
	var st = Game.daily_state()
	_status = UIStyle.make_label("", "body", 32, UIStyle.TEXT_DIM, HORIZONTAL_ALIGNMENT_CENTER)
	_status.text = "STREAK %d DAYS  ·  %s" % [int(st.get("streak", 0)),
		"REWARD AVAILABLE" if bool(st.get("can_claim", false)) else "NEXT REWARD TOMORROW"]
	v.add_child(_status)


func _build_streak() -> void:
	var row = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	row.offset_left = 96
	row.offset_right = -96
	row.offset_top = 420
	row.offset_bottom = 720
	row.add_theme_constant_override("separation", 18)
	content.add_child(row)
	_streak_row = row
	var st = Game.daily_state()
	var day_index = int(st.get("day_index", 0))
	var can_claim = bool(st.get("can_claim", false))
	var claimed_today = bool(st.get("claimed_today", false))
	for i in range(GameData.DAILY_REWARDS.size()):
		var r: Dictionary = GameData.DAILY_REWARDS[i]
		var is_today = i == day_index and can_claim
		var is_past = i < day_index or (i == day_index and claimed_today)
		var accent = UIStyle.GOLD if is_today else (UIStyle.LIME if is_past else UIStyle.TEXT_DIM)
		var p = UIStyle.make_glass_panel(24, Color(0.05, 0.08, 0.14, 0.8), 20,
			0.7 if is_today else 0.0)
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		p.custom_minimum_size = Vector2(0, 250)
		var v = VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 4)
		p.add_child(v)
		var dl = UIStyle.make_kicker("DAY %d" % (i + 1), accent, 16)
		dl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(dl)
		var badge = PanelContainer.new()
		badge.custom_minimum_size = Vector2(96, 96)
		badge.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		badge.add_theme_stylebox_override("panel", UIStyle.accent_box(accent, 0.2, 48, 0.4 if is_today else 0.0))
		var ic = TextureRect.new()
		ic.texture = UIStyle.icon("coin" if i < 6 else "diamond")
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		ic.modulate = Color.WHITE if (is_today or is_past) else Color(0.35, 0.4, 0.5)
		badge.add_child(ic)
		v.add_child(badge)
		var amt = UIStyle.make_label(str(r["label"]), "display", 30, Color.WHITE if (is_today or is_past) else UIStyle.TEXT_DIM)
		amt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(amt)
		if is_past:
			var chk = UIStyle.make_label("CLAIMED", "kicker", 13, UIStyle.LIME)
			chk.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			v.add_child(chk)
		elif is_today:
			var now = UIStyle.make_label("TODAY", "kicker", 13, UIStyle.GOLD)
			now.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			v.add_child(now)
		row.add_child(p)


func _build_claim() -> void:
	var st = Game.daily_state()
	var can = bool(st.get("can_claim", false))
	var btn = UIStyle.make_button(Localization.t("daily.claim"), UIStyle.GOLD, true, 34, 100)
	btn.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	btn.offset_left = 480
	btn.offset_right = -480
	btn.offset_top = -200
	btn.offset_bottom = -100
	btn.disabled = not can
	btn.pressed.connect(_claim)
	content.add_child(btn)


func _claim() -> void:
	var got: Dictionary = Game.claim_daily()
	if got.is_empty():
		return
	AudioDirector.play_sfx("achievement", -2.0)
	AudioDirector.play_sfx("purchase", -6.0)
	_rebuild()


func _rebuild() -> void:
	for c in content.get_children():
		c.queue_free()
	build()


## Four rotating daily missions with live progress bars. They reset at local
## midnight and pay out the moment they complete, so this list is a record of
## what has already been earned as much as it is a to-do list.
func _build_missions() -> void:
	var head = UIStyle.make_kicker("DAILY MISSIONS", UIStyle.LIME, 20)
	head.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	head.offset_left = 96
	head.offset_top = 740
	content.add_child(head)

	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	scroll.offset_left = 96
	scroll.offset_right = -96
	scroll.offset_top = 776
	scroll.offset_bottom = -210
	content.add_child(scroll)

	var box = VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 12)
	scroll.add_child(box)

	var ms: Array = Missions.missions(Game.data)
	if ms.is_empty():
		box.add_child(UIStyle.make_label("No missions today — check back tomorrow.",
			"body", 26, UIStyle.TEXT_DIM))
		return
	for m in ms:
		var done := bool(m.get("done", false))
		var accent: Color = UIStyle.LIME if done else UIStyle.CYAN
		var row := UIStyle.make_glass_panel(18, Color(0.05, 0.08, 0.14, 0.86), 18,
			0.55 if done else 0.16)
		row.custom_minimum_size = Vector2(0, 118)
		var h = HBoxContainer.new()
		h.add_theme_constant_override("separation", 18)
		row.add_child(h)
		var v = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 6)
		h.add_child(v)
		v.add_child(UIStyle.make_label(Missions.mission_text(m), "body", 27, Color.WHITE))
		# progress bar: a background Control with a fill anchored to `ratio`
		var ratio: float = clampf(float(m.get("progress", 0)) / maxf(1.0, float(m.get("target", 1))), 0.0, 1.0)
		var track = Control.new()
		track.custom_minimum_size = Vector2(0, 12)
		track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var track_bg = ColorRect.new()
		track_bg.color = Color(1, 1, 1, 0.10)
		track_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		track.add_child(track_bg)
		var fill = ColorRect.new()
		fill.color = accent
		fill.anchor_left = 0.0
		fill.anchor_top = 0.0
		fill.anchor_bottom = 1.0
		fill.anchor_right = ratio
		fill.offset_left = 0
		fill.offset_top = 0
		fill.offset_right = 0
		fill.offset_bottom = 0
		track.add_child(fill)
		v.add_child(track)
		var pct = UIStyle.make_label("%d / %d" % [int(current), int(target)],
			"numeric", 18, UIStyle.TEXT_DIM)
		v.add_child(pct)
		var right = VBoxContainer.new()
		right.alignment = BoxContainer.ALIGNMENT_CENTER
		h.add_child(right)
		right.add_child(UIStyle.make_label(fmt_credits(int(m.get("reward", 0))),
			"numeric", 26, UIStyle.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
		var tag = UIStyle.make_kicker("DONE" if done else "IN PROGRESS", accent, 14)
		tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		right.add_child(tag)
		box.add_child(row)
