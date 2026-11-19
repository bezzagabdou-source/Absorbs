extends "res://scripts/ui/ScreenBase.gd"
## Career profile: level ring, XP progress, lifetime stats, collections and the
## achievements shortcut.

var _ring: Control
var _level := 1
var _progress := 0.0


func build() -> void:
	top_bar(Localization.t("profile.title"))
	_build_level_card()
	_build_stat_grid()
	_build_collections()


func _build_level_card() -> void:
	var card := UIStyle.make_glass_panel(30, Color(0.04, 0.06, 0.11, 0.86), 32, 0.25)
	card.set_anchors_preset(Control.PRESET_TOP_WIDE)
	card.offset_left = 44
	card.offset_right = -44
	card.offset_top = 168
	card.offset_bottom = 452
	content.add_child(card)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 40)
	card.add_child(h)
	var ring_holder := Control.new()
	ring_holder.custom_minimum_size = Vector2(240, 240)
	h.add_child(ring_holder)
	_ring = Control.new()
	_ring.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ring.draw.connect(_draw_ring)
	ring_holder.add_child(_ring)
	var lv := UIStyle.make_title(str(Game.level()), 96, UIStyle.CYAN, HORIZONTAL_ALIGNMENT_CENTER)
	lv.set_anchors_preset(Control.PRESET_FULL_RECT)
	lv.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ring_holder.add_child(lv)
	var info := Game.level_progress()
	_level = Game.level()
	_progress = float(info.get("frac", 0.0))
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 6)
	h.add_child(v)
	v.add_child(UIStyle.make_kicker(Localization.t("profile.title"), UIStyle.CYAN, 16))
	v.add_child(UIStyle.make_title("LEVEL %d" % Game.level(), 64, UIStyle.CYAN))
	v.add_child(UIStyle.make_label(Localization.trf("profile.next_level", [Game.level() + 1]), "body", 24,
		UIStyle.TEXT_DIM))
	v.add_child(UIStyle.make_kicker(Localization.t("profile.total_xp"), UIStyle.TEXT_DIM, 14))
	v.add_child(UIStyle.make_progress_bar(_progress * 100.0, UIStyle.CYAN, 16))
	v.add_child(UIStyle.make_label("%d / %d XP  ·  %s" % [Game.xp(), int(info.get("next", 0)),
		fmt_credits(Game.credits())], "numeric", 22, Color.WHITE))
	var badges := HBoxContainer.new()
	badges.add_theme_constant_override("separation", 10)
	v.add_child(badges)
	badges.add_child(UIStyle.make_chip("%d CARS" % Game.owned_count(), UIStyle.LIME, 16))
	badges.add_child(UIStyle.make_chip("%d AWARDS" % _unlocked_achievements(), UIStyle.GOLD, 16))
	badges.add_child(UIStyle.make_chip("%.1f KM" % Game.total_distance_km(), UIStyle.VIOLET, 16))


func _draw_ring() -> void:
	var c := Vector2(120, 120)
	_ring.draw_arc(c, 100, -PI * 0.5, PI * 1.5, 72, Color(1, 1, 1, 0.08), 18.0, true)
	_ring.draw_arc(c, 100, -PI * 0.5, -PI * 0.5 + PI * 2.0 * clampf(_progress, 0.0, 1.0), 72,
		UIStyle.CYAN, 18.0, true)


func _unlocked_achievements() -> int:
	var n := 0
	for a in GameData.ACHIEVEMENTS:
		if Game.unlocked(str(a["id"])):
			n += 1
	return n


func _build_stat_grid() -> void:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.set_anchors_preset(Control.PRESET_TOP_WIDE)
	grid.offset_left = 44
	grid.offset_right = -44
	grid.offset_top = 480
	grid.offset_bottom = 760
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 18)
	content.add_child(grid)
	var st: Dictionary = Game.data.get("stats", {})
	var items := [
		[Localization.t("profile.races"), str(int(st.get("races", 0))), "flag"],
		[Localization.t("profile.wins"), str(int(st.get("wins", 0))), "trophy"],
		[Localization.t("profile.podiums"), str(int(st.get("podiums", 0))), "star"],
		[Localization.t("profile.top_speed"), "%.0f" % float(st.get("top_speed", 0.0)), "gauge"],
		[Localization.t("profile.distance"), "%.1f" % float(st.get("distance_km", 0.0)), "signal"],
		[Localization.t("stats.cars"), "%d" % Game.owned_count(), "garage"],
		["DRIFT", "%.0f S" % float(st.get("drift_time", 0.0)), "wheel"],
		["NITRO", "%.0f S" % float(st.get("nitro_time", 0.0)), "nitro"],
	]
	for it in items:
		var p := UIStyle.make_glass_panel(22, Color(0.05, 0.08, 0.14, 0.72), 22)
		p.custom_minimum_size = Vector2(0, 128)
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 14)
		p.add_child(h)
		var ic := TextureRect.new()
		ic.texture = UIStyle.icon(str(it[2]))
		ic.custom_minimum_size = Vector2(44, 44)
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		ic.modulate = UIStyle.CYAN
		h.add_child(ic)
		var v := VBoxContainer.new()
		v.add_theme_constant_override("separation", -6)
		h.add_child(v)
		v.add_child(UIStyle.make_label(str(it[1]), "display", 38, Color.WHITE))
		v.add_child(UIStyle.make_kicker(str(it[0]), UIStyle.TEXT_DIM, 13))
		grid.add_child(p)


func _build_collections() -> void:
	var row := HBoxContainer.new()
	row.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	row.offset_left = 44
	row.offset_right = -44
	row.offset_top = -260
	row.offset_bottom = -44
	row.add_theme_constant_override("separation", 18)
	content.add_child(row)
	row.add_child(_collection_card(Localization.t("profile.cars"), Game.owned_count(), GameData.CARS.size(),
		UIStyle.CYAN, func(): go("garage")))
	row.add_child(_collection_card(Localization.t("profile.achievements"), _unlocked_achievements(),
		GameData.ACHIEVEMENTS.size(), UIStyle.GOLD, func(): go("achievements")))
	row.add_child(_collection_card("PAINTS", _owned_paints(), GameData.PAINTS.size(),
		UIStyle.MAGENTA, func(): go("garage")))
	row.add_child(_collection_card("RIMS", _owned_rims(), GameData.RIMS.size(),
		UIStyle.VIOLET, func(): go("garage")))


func _owned_paints() -> int:
	var n := 0
	for p in GameData.PAINTS:
		if Game.owns_paint(str(p["id"])):
			n += 1
	return n


func _owned_rims() -> int:
	var n := 0
	for r in GameData.RIMS:
		if Game.owns_rim(str(r["id"])):
			n += 1
	return n


func _collection_card(title: String, have: int, total: int, accent: Color, cb: Callable) -> Control:
	var p := UIStyle.make_glass_panel(22, Color(0.05, 0.08, 0.14, 0.72), 22)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	p.add_child(v)
	v.add_child(UIStyle.make_kicker(title, UIStyle.TEXT_DIM, 14))
	v.add_child(UIStyle.make_title("%d / %d" % [have, total], 42, accent))
	v.add_child(UIStyle.make_progress_bar(float(have) / maxf(1.0, float(total)) * 100.0, accent, 8))
	var b := UIStyle.make_button("VIEW", accent, false, 16, 48)
	b.pressed.connect(cb)
	v.add_child(b)
	return p
