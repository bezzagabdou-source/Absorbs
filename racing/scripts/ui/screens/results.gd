extends "res://scripts/ui/ScreenBase.gd"
## Post-race results: podium position, lap table, rewards, new-record callout,
## and progression hooks (credits / XP / achievements).

var _result: Dictionary = {}
var _claimed = false


func build() -> void:
	_result = params.duplicate(true)
	var mode = str(_result.get("mode", "circuit"))
	var pos = int(_result.get("position", 1))
	var win = mode == "circuit" and pos == 1
	var accent = UIStyle.GOLD if win else UIStyle.CYAN
	AudioDirector.play_music("results_theme", 0.5, -9.0)
	var art = UIStyle.make_art_background("menu_hero")
	content.add_child(art)
	var wrap = VBoxContainer.new()
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wrap.offset_left = 120
	wrap.offset_right = -120
	wrap.offset_top = 60
	wrap.offset_bottom = -50
	wrap.add_theme_constant_override("separation", 16)
	content.add_child(wrap)
	wrap.add_child(UIStyle.make_kicker(str(_result.get("track_name", "")), accent, 20))
	var head = Localization.t("results.win") if win else Localization.t("results.title")
	wrap.add_child(UIStyle.make_title(head, 96, accent, HORIZONTAL_ALIGNMENT_CENTER))
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 22)
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	wrap.add_child(row)
	row.add_child(_big_stat(Localization.t("results.position"), _pos_text(), accent))
	row.add_child(_big_stat(Localization.t("results.time"), _fmt(float(_result.get("time", 0.0))), UIStyle.CYAN))
	row.add_child(_big_stat(Localization.t("results.best_lap"), _fmt(float(_result.get("best_lap", 0.0))),
		UIStyle.MAGENTA))
	var left = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 10)
	row.add_child(left)
	left.add_child(UIStyle.make_kicker(Localization.t("results.lap_list"), UIStyle.TEXT_DIM, 16))
	var laps: Array = _result.get("laps", [])
	if laps.is_empty():
		left.add_child(UIStyle.make_label("—", "body", 24, UIStyle.TEXT_DIM))
	for i in range(laps.size()):
		var bar = UIStyle.make_glass_panel(16, Color(0.05, 0.08, 0.14, 0.62), 18)
		var h = HBoxContainer.new()
		bar.add_child(h)
		var lap_lbl = UIStyle.make_label("LAP %d" % (i + 1), "kicker", 18, UIStyle.TEXT_DIM)
		lap_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(lap_lbl)
		var t = float(laps[i])
		var is_best = t <= float(_result.get("best_lap", 9999.0)) + 0.001
		h.add_child(UIStyle.make_label(_fmt(t), "numeric", 26,
			UIStyle.GOLD if is_best else Color.WHITE))
		left.add_child(bar)
	var reward_panel = UIStyle.make_glass_panel(26, Color(0.05, 0.08, 0.14, 0.78), 28, 0.25)
	reward_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(reward_panel)
	var rv = VBoxContainer.new()
	rv.add_theme_constant_override("separation", 8)
	reward_panel.add_child(rv)
	rv.add_child(UIStyle.make_kicker(Localization.t("results.reward"), UIStyle.TEXT_DIM, 16))
	rv.add_child(_reward_row("coin", "+%s" % fmt_credits(int(_result.get("credits", 0))), UIStyle.GOLD, 44))
	rv.add_child(_reward_row("star", "+%d XP" % int(_result.get("xp", 0)), UIStyle.CYAN, 40))
	var notes = []
	if bool(_result.get("clean_lap", false)):
		notes.append("CLEAN RUN  +25%")
	if int(_result.get("wall_hits", 0)) > 0:
		notes.append("%d WALL HITS" % int(_result["wall_hits"]))
	if float(_result.get("top_speed", 0.0)) > 0.0:
		notes.append("TOP %.0f KM/H" % float(_result["top_speed"]))
	for n in notes:
		rv.add_child(UIStyle.make_chip(n, UIStyle.VIOLET, 15))
	var btn_row = HBoxContainer.new()
	btn_row.add_theme_constant_override("separation", 18)
	btn_row.alignment = BoxContainer.ALIGNMENT_CENTER
	wrap.add_child(btn_row)
	var retry = UIStyle.make_button(Localization.t("results.retry"), UIStyle.VIOLET, false, 28, 86)
	retry.custom_minimum_size = Vector2(420, 86)
	retry.pressed.connect(func(): go("race", {"track": _track(), "mode": str(_result.get("mode", "circuit")),
		"laps": int(_result.get("laps_target", 3))}, false))
	btn_row.add_child(retry)
	var next = UIStyle.make_button(Localization.t("results.next"), accent, true, 28, 86)
	next.custom_minimum_size = Vector2(420, 86)
	next.pressed.connect(func(): go("tracks", {}, false))
	btn_row.add_child(next)
	_award()


func _track() -> Dictionary:
	var id = str(_result.get("track", ""))
	for t in GameData.TRACKS:
		if str(t["id"]) == id:
			return t
	return GameData.TRACKS[0]


func _pos_text() -> String:
	var pos = int(_result.get("position", 1))
	var suffix = "TH"
	if pos == 1:
		suffix = "ST"
	elif pos == 2:
		suffix = "ND"
	elif pos == 3:
		suffix = "RD"
	return "%d%s" % [pos, suffix]


func _big_stat(label_text: String, value: String, accent: Color) -> Control:
	var p = UIStyle.make_glass_panel(26, Color(0.05, 0.08, 0.14, 0.8), 28, 0.3)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", -6)
	p.add_child(v)
	v.add_child(UIStyle.make_kicker(label_text, UIStyle.TEXT_DIM, 15))
	v.add_child(UIStyle.make_title(value, 72, accent))
	return p


func _reward_row(icon_name: String, text: String, accent: Color, icon_size: float) -> Control:
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	var ic = TextureRect.new()
	ic.texture = UIStyle.icon(icon_name)
	ic.custom_minimum_size = Vector2(icon_size, icon_size)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	h.add_child(ic)
	h.add_child(UIStyle.make_title(text, 44, accent))
	return h


func _fmt(t: float) -> String:
	if t <= 0.0:
		return "--:--.--"
	var m = int(t / 60.0)
	var s = int(t) % 60
	var cs = int((t - floorf(t)) * 100.0)
	return "%02d:%02d.%02d" % [m, s, cs]


func _award() -> void:
	if _claimed:
		return
	_claimed = true
	var prev_best: float = Game.best_lap(str(_result.get("track", "")))
	Game.record_race({
		"position": int(_result.get("position", 1)),
		"track": str(_result.get("track", "")),
		"time": float(_result.get("time", 0.0)),
		"best_lap": float(_result.get("best_lap", 0.0)),
		"distance_km": float(_result.get("distance_km", 0.0)),
		"top_speed": float(_result.get("top_speed", 0.0)),
		"drift_time": float(_result.get("drift_time", 0.0)),
		"nitro_time": float(_result.get("nitro_time", 0.0)),
		"clean_lap": bool(_result.get("clean_lap", false)),
		"time_of_day": str(_result.get("time_of_day", "")),
		"weather": str(_result.get("weather", "")),
	})
	Game.add_credits(int(_result.get("credits", 0)))
	var up: Dictionary = Game.add_xp(int(_result.get("xp", 0)))
	if bool(up.get("leveled", false)):
		AudioDirector.play_sfx("level_up", -2.0)
	var new_best = prev_best <= 0.0 or float(_result.get("best_lap", 0.0)) < prev_best
	if new_best and float(_result.get("best_lap", 0.0)) > 0.0:
		AudioDirector.play_sfx("achievement", -4.0)
		var badge = UIStyle.make_chip(Localization.t("results.new_best"), UIStyle.GOLD, 18)
		badge.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
		badge.offset_left = -220
		badge.offset_right = 220
		badge.offset_top = 200
		content.add_child(badge)
