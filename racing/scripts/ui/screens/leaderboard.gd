extends "res://scripts/ui/ScreenBase.gd"
## Local leaderboard.
##
## This ranks the player against a fixed set of rival records and their own best
## career numbers. It is deliberately local: an online board needs a service, a
## privacy policy and moderation, and pretending to have one would be a lie the
## first time somebody checked. The row data is built by `Missions.leaderboard()`
## so swapping in a network source later is a one-function change.

const ROW_HEIGHT := 104

var _rows: VBoxContainer


func build() -> void:
	top_bar("LEADERBOARD")
	Missions.ensure_missions(Game.data)
	_build_hero()
	_build_rows()


func _build_hero() -> void:
	var art = UIStyle.make_art_background("results_bg")
	art.modulate.a = 0.22
	content.add_child(art)
	content.move_child(art, 0)

	var rank: int = Missions.player_rank(Game.data)
	var board: Array = Missions.leaderboard(Game.data)
	var top_score: int = int(board[0][1]) if not board.is_empty() else 1

	var v = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	v.offset_left = 96
	v.offset_right = -96
	v.offset_top = 158
	v.offset_bottom = 400
	v.add_theme_constant_override("separation", 6)
	content.add_child(v)
	v.add_child(UIStyle.make_kicker("GLOBAL LADDER · LOCAL RECORDS", UIStyle.GOLD, 18))
	v.add_child(UIStyle.make_title("LEADERBOARD", 82, Color.WHITE))
	v.add_child(UIStyle.make_label(
		"You are #%d of %d   ·   %s points" % [rank, board.size(), fmt_credits(int(board[mini(rank - 1, board.size() - 1)][1]))],
		"body", 30, UIStyle.TEXT_DIM))
	if top_score <= 0:
		top_score = 1


func _build_rows() -> void:
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.offset_left = 96
	scroll.offset_right = -96
	scroll.offset_top = 420
	scroll.offset_bottom = -48
	content.add_child(scroll)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", 10)
	scroll.add_child(_rows)

	var board: Array = Missions.leaderboard(Game.data)
	var top_score: int = int(board[0][1]) if not board.is_empty() else 1
	for i in board.size():
		_add_row(i + 1, str(board[i][0]), int(board[i][1]), bool(board[i][2]), top_score)


func _add_row(place: int, name: String, score: int, is_player: bool, top_score: int) -> void:
	var accent: Color = UIStyle.GOLD if place == 1 else (
		UIStyle.CYAN if is_player else Color(0.72, 0.78, 0.9))
	var panel = UIStyle.make_glass_panel(16,
		Color(0.07, 0.10, 0.18, 0.92) if is_player else Color(0.04, 0.06, 0.11, 0.78),
		18, 0.85 if is_player else 0.10)
	panel.custom_minimum_size = Vector2(0, ROW_HEIGHT)
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 22)
	panel.add_child(h)

	var place_label = UIStyle.make_numeral(str(place), 44, accent)
	place_label.custom_minimum_size = Vector2(96, 0)
	place_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(place_label)

	var nv = VBoxContainer.new()
	nv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nv.alignment = BoxContainer.ALIGNMENT_CENTER
	nv.add_theme_constant_override("separation", 4)
	h.add_child(nv)
	var title = UIStyle.make_label(name + ("   ·   YOU" if is_player else ""),
		"display", 30, Color.WHITE if is_player else UIStyle.TEXT)
	nv.add_child(title)
	# relative score bar
	var bar = Control.new()
	bar.custom_minimum_size = Vector2(0, 8)
	var bg_rect = ColorRect.new()
	bg_rect.color = Color(1, 1, 1, 0.08)
	bg_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bar.add_child(bg_rect)
	var fill = ColorRect.new()
	fill.color = accent
	fill.anchor_left = 0.0
	fill.anchor_top = 0.0
	fill.anchor_bottom = 1.0
	fill.anchor_right = clampf(float(score) / float(maxi(1, top_score)), 0.02, 1.0)
	fill.offset_left = 0
	fill.offset_top = 0
	fill.offset_right = 0
	fill.offset_bottom = 0
	bar.add_child(fill)
	nv.add_child(bar)

	var sc = UIStyle.make_label(fmt_credits(score), "numeric", 30, accent)
	sc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(sc)

	_rows.add_child(panel)
