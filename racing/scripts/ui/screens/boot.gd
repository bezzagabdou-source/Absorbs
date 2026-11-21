extends "res://scripts/ui/ScreenBase.gd"
## Cinematic boot sequence.
##
## Layout is deliberately explicit (no container overflow): the artwork is
## zoomed so the wordmark baked into the illustration sits outside the frame,
## then a clean brand lockup and a progress rail are drawn on top.
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


## The shipped hero illustration already contains a VELOCITY wordmark in its
## lower half. Drawing a second one on top produced a doubled, unreadable logo,
## so the art is scaled up and pushed down: what stays on screen is skyline and
## sky, and the type on top is the only type in the frame.
func _build_intro_backdrop() -> void:
	var holder = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.clip_contents = true
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(holder)

	var art = TextureRect.new()
	art.texture = UIStyle.art("menu_hero")
	art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.pivot_offset = Vector2(960, 300)
	art.scale = Vector2(2.05, 2.05)
	art.position.y = 70.0
	holder.add_child(art)

	# vertical grade: keeps the type legible without hiding the city
	var top = ColorRect.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_bottom = 210
	top.color = Color(0.008, 0.012, 0.026, 0.92)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(top)

	var bottom = ColorRect.new()
	bottom.anchor_top = 1.0
	bottom.anchor_bottom = 1.0
	bottom.anchor_left = 0.0
	bottom.anchor_right = 1.0
	bottom.offset_top = -520
	bottom.color = Color(0.008, 0.012, 0.026, 0.90)
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(bottom)

	var mid = ColorRect.new()
	mid.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mid.color = Color(0.02, 0.03, 0.06, 0.34)
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(mid)

	# thin horizon light that breathes
	var glow = ColorRect.new()
	glow.anchor_left = 0.5
	glow.anchor_right = 0.5
	glow.anchor_top = 0.5
	glow.anchor_bottom = 0.5
	glow.offset_left = -640
	glow.offset_right = 640
	glow.offset_top = -150
	glow.offset_bottom = -147
	glow.color = Color(UIStyle.CYAN.r, UIStyle.CYAN.g, UIStyle.CYAN.b, 0.55)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(glow)
	var tw = create_tween().set_loops()
	tw.tween_property(glow, "modulate:a", 0.22, 1.8).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(glow, "modulate:a", 0.9, 1.8).set_ease(Tween.EASE_IN_OUT)


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


## Brand lockup, placed in the empty upper third so nothing competes with it.
func _build_logo() -> void:
	var block = VBoxContainer.new()
	block.anchor_left = 0.0
	block.anchor_right = 1.0
	block.anchor_top = 0.0
	block.anchor_bottom = 0.0
	block.offset_top = 118
	block.offset_bottom = 470
	block.offset_left = 0
	block.offset_right = 0
	block.alignment = BoxContainer.ALIGNMENT_BEGIN
	block.add_theme_constant_override("separation", 0)
	content.add_child(block)

	var kicker = UIStyle.make_kicker("SEASON 1  ·  NEON DISTRICT", UIStyle.CYAN, 22)
	kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kicker.modulate.a = 0.0
	block.add_child(kicker)

	var logo = UIStyle.make_title("APEX", 118, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	logo.modulate.a = 0.0
	block.add_child(logo)

	var logo2 = UIStyle.make_title("VELOCITY", 118, UIStyle.MAGENTA, HORIZONTAL_ALIGNMENT_CENTER)
	logo2.modulate.a = 0.0
	block.add_child(logo2)

	var tagline = UIStyle.make_label(Localization.t("menu.tagline"), "body", 26, UIStyle.TEXT_DIM,
		HORIZONTAL_ALIGNMENT_CENTER)
	tagline.modulate.a = 0.0
	block.add_child(tagline)

	var tw = create_tween()
	tw.tween_property(kicker, "modulate:a", 1.0, 0.30)
	tw.parallel().tween_property(logo, "modulate:a", 1.0, 0.55)
	tw.tween_property(logo2, "modulate:a", 1.0, 0.45)
	tw.tween_property(tagline, "modulate:a", 1.0, 0.40)
	tw.parallel().tween_property(_streak_root, "modulate:a", 1.0, 0.90)


func _build_progress() -> void:
	var v = VBoxContainer.new()
	v.anchor_left = 0.0
	v.anchor_right = 1.0
	v.anchor_top = 1.0
	v.anchor_bottom = 1.0
	v.offset_top = -232
	v.offset_bottom = -96
	v.offset_left = 0
	v.offset_right = 0
	v.add_theme_constant_override("separation", 12)
	v.alignment = BoxContainer.ALIGNMENT_END
	content.add_child(v)

	_status = UIStyle.make_kicker(Localization.t("boot.loading"), UIStyle.TEXT_DIM, 20)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.modulate.a = 0.0
	v.add_child(_status)

	var wrap = CenterContainer.new()
	wrap.custom_minimum_size = Vector2(0, 26)
	v.add_child(wrap)
	var rail_box = Control.new()
	rail_box.custom_minimum_size = Vector2(840, 26)
	wrap.add_child(rail_box)
	var rail = ColorRect.new()
	rail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rail.offset_top = 10
	rail.offset_bottom = -10
	rail.color = Color(1, 1, 1, 0.10)
	rail_box.add_child(rail)
	_bar = UIStyle.make_progress_bar(0.0, UIStyle.CYAN, 8)
	_bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_bar.offset_top = 10
	_bar.offset_bottom = -10
	rail_box.add_child(_bar)
	_bar.value = 6.0

	var row = CenterContainer.new()
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
