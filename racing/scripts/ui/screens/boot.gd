extends "res://scripts/ui/ScreenBase.gd"
## Cinematic boot sequence.
##
## Layers, back to front:
##   1. deep-space gradient + animated scanline haze
##   2. diagonal speed streaks that sweep across the frame
##   3. the APEX VELOCITY wordmark, letter-spaced and lit from the left
##   4. a thin progress rail with staged status copy
##
## Still the entry point used by the CI scene-load test, and every animation is
## driven by tweens so it cannot stall a headless run.

var _status: Label
var _bar: ProgressBar
var _bar_pct: Label
var _streak_root: Control

const SEGMENTS := 14


func build() -> void:
	AudioDirector.play_music("menu_theme", 0.8, -14.0)
	_build_intro_backdrop()
	_build_streaks()
	_build_logo()
	_build_progress()
	_run_sequence()


func _build_intro_backdrop() -> void:
	var bg = UIStyle.make_art_background("menu_hero")
	bg.modulate = Color(1.0, 1.0, 1.0, 1.0)
	content.add_child(bg)
	# darken the top and bottom so the wordmark always has contrast
	var top = ColorRect.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_bottom = 150
	top.color = Color(0.01, 0.015, 0.03, 0.82)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(top)
	var bottom = ColorRect.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -420
	bottom.color = Color(0.01, 0.015, 0.03, 0.92)
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(bottom)
	# horizon glow line
	var glow = ColorRect.new()
	glow.anchor_left = 0.5
	glow.anchor_right = 0.5
	glow.anchor_top = 0.5
	glow.anchor_bottom = 0.5
	glow.offset_left = -700
	glow.offset_right = 700
	glow.offset_top = 6
	glow.offset_bottom = 9
	glow.color = Color(UIStyle.CYAN.r, UIStyle.CYAN.g, UIStyle.CYAN.b, 0.55)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(glow)
	var tw = create_tween().set_loops()
	tw.tween_property(glow, "modulate:a", 0.25, 1.6).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(glow, "modulate:a", 0.85, 1.6).set_ease(Tween.EASE_IN_OUT)


func _build_streaks() -> void:
	_streak_root = Control.new()
	_streak_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_streak_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_streak_root.modulate.a = 0.0
	content.add_child(_streak_root)
	for i in range(SEGMENTS):
		var s = ColorRect.new()
		var long = 220.0 + float(i % 5) * 130.0
		var thick = 2.0 + float(i % 3)
		s.size = Vector2(long, thick)
		s.color = UIStyle.CYAN if i % 2 == 0 else UIStyle.MAGENTA
		s.modulate.a = 0.10 + 0.05 * float(i % 4)
		s.rotation = -0.30
		s.position = Vector2(-400.0 - float(i) * 90.0, 120.0 + float(i) * 62.0)
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_streak_root.add_child(s)
		var tw = create_tween().set_loops()
		tw.tween_property(s, "position:x", 2200.0, 2.6 + float(i % 6) * 0.42) \
			.set_trans(Tween.TRANS_LINEAR)
		tw.parallel().tween_property(s, "modulate:a", 0.0, 0.9).set_delay(1.7)
		tw.tween_property(s, "position:x", -400.0 - float(i) * 90.0, 0.0)
		tw.tween_property(s, "modulate:a", 0.10 + 0.05 * float(i % 4), 0.4)


func _build_logo() -> void:
	var block = VBoxContainer.new()
	block.anchor_left = 0.5
	block.anchor_right = 0.5
	block.anchor_top = 0.5
	block.anchor_bottom = 0.5
	block.offset_left = -620
	block.offset_right = 620
	block.offset_top = 118
	block.offset_bottom = 470
	block.alignment = BoxContainer.ALIGNMENT_CENTER
	block.add_theme_constant_override("separation", -22)
	content.add_child(block)

	var kicker = UIStyle.make_kicker(Localization.t("app.title"), UIStyle.CYAN, 24)
	kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kicker.modulate.a = 0.0
	block.add_child(kicker)

	var logo = UIStyle.make_title("APEX", 150, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	logo.modulate.a = 0.0
	logo.position.y += 26.0
	block.add_child(logo)

	var logo2 = UIStyle.make_title("VELOCITY", 150, UIStyle.MAGENTA, HORIZONTAL_ALIGNMENT_CENTER)
	logo2.modulate.a = 0.0
	logo2.position.y += 26.0
	block.add_child(logo2)

	var tagline = UIStyle.make_label(Localization.t("menu.tagline"), "body", 30, UIStyle.TEXT_DIM)
	tagline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tagline.modulate.a = 0.0
	block.add_child(tagline)

	var tw = create_tween()
	tw.tween_property(kicker, "modulate:a", 1.0, 0.35)
	tw.parallel().tween_property(logo, "modulate:a", 1.0, 0.55)
	tw.parallel().tween_property(logo, "position:y", logo.position.y - 26.0, 0.7) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(logo2, "modulate:a", 1.0, 0.45)
	tw.parallel().tween_property(logo2, "position:y", logo2.position.y - 26.0, 0.6) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(tagline, "modulate:a", 1.0, 0.4)
	tw.parallel().tween_property(_streak_root, "modulate:a", 1.0, 0.9)


func _build_progress() -> void:
	var v = VBoxContainer.new()
	v.anchor_left = 0.5
	v.anchor_right = 0.5
	v.anchor_top = 1.0
	v.anchor_bottom = 1.0
	v.offset_left = -420
	v.offset_right = 420
	v.offset_top = -230
	v.offset_bottom = -96
	v.add_theme_constant_override("separation", 10)
	v.alignment = BoxContainer.ALIGNMENT_END
	content.add_child(v)

	_status = UIStyle.make_kicker(Localization.t("boot.loading"), UIStyle.TEXT_DIM, 20)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.modulate.a = 0.0
	v.add_child(_status)

	var wrap = Control.new()
	wrap.custom_minimum_size = Vector2(840, 30)
	v.add_child(wrap)
	var rail = ColorRect.new()
	rail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rail.offset_top = 12
	rail.offset_bottom = -12
	rail.color = Color(1, 1, 1, 0.10)
	wrap.add_child(rail)
	_bar = UIStyle.make_progress_bar(0.0, UIStyle.CYAN, 8)
	_bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_bar.offset_top = 12
	_bar.offset_bottom = -12
	wrap.add_child(_bar)
	_bar.value = 6.0

	var row = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	v.add_child(row)
	_bar_pct = UIStyle.make_label("6%", "numeric", 22, UIStyle.CYAN)
	row.add_child(_bar_pct)


func _run_sequence() -> void:
	await get_tree().create_timer(0.45).timeout
	_status.modulate.a = 1.0
	for step in [[34.0, Localization.t("boot.loading_assets")],
			[58.0, Localization.t("boot.tuning")],
			[78.0, Localization.t("boot.track")],
			[92.0, Localization.t("boot.warming")]]:
		await get_tree().create_timer(0.24).timeout
		_bar.value = float(step[0])
		_bar_pct.text = "%d%%" % int(step[0])
		_status.text = str(step[1])
	_bar.value = 100.0
	_bar_pct.text = "100%"
	_status.text = Localization.t("boot.ready")
	await get_tree().create_timer(0.40).timeout
	router.replace("menu")
