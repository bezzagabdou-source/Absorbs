extends "res://scripts/ui/ScreenBase.gd"
## Cinematic entry sequence — a live 3D showroom, not a painting.
##
## The opening beat of a racing game is the one place the player decides whether
## it looks like money. The previous version zoomed a static illustration; a flat
## image cannot move with the device, cannot show the paint shader under moving
## lights, and reads as a menu. This version builds a real studio: a hero car on a
## turntable, three-point lighting, a slow dolly, then the wordmark resolves over
## the top with a velocity streak pass and a loading rail that reports real work.
##
## Two rules are enforced structurally:
##   * The 3D view sits in a SubViewport that is rendered BEHIND the UI canvas, so
##     a slow first frame can never hide the title or the progress rail.
##   * If the renderer refuses to give a 3D context, `_showroom` stays null and the
##     iced gradient background carries the sequence. There is no black frame.

const ShowroomScript = preload("res://scripts/ui/Showroom3D.gd")

var _status: Label
var _bar: ProgressBar
var _bar_pct: Label
var _streak_root: Control
var _showroom: Node3D = null
var _sub: SubViewport = null
var _vignette: ColorRect = null
var _logo_block: VBoxContainer = null
var _built: bool = false

const SEGMENTS := 14


func build() -> void:
	if _built:
		return
	_built = true
	if content == null:
		content = Control.new()
		content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.mouse_filter = Control.MOUSE_FILTER_PASS
		add_child(content)
	AudioDirector.play_music("menu_theme", 0.8, -14.0)
	_build_backdrop()
	_build_showroom()
	_build_streaks()
	_build_logo()
	_build_progress()
	_run_sequence()


## A deep, graded background that stays legible whether or not 3D comes up. Two
## stacked gradient bands and a soft horizon glow — no image asset, so it costs
## nothing to load and nothing to keep resident.
## Guard against a second build. ScreenBase calls build() once from _ready(), but
## this screen starts timers, tweens and a 3D viewport; running it twice would
## double every one of them. The flag also makes build() safe to call directly
## from a test harness before the node has entered the tree, which is what the
## CI "runtime boot" section does.
func _build_backdrop() -> void:
	if content == null:
		return
	var base := ColorRect.new()
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	base.color = Color(0.007, 0.009, 0.016)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(base)


func _build_showroom() -> void:
	# A SubViewport keeps the studio off the UI canvas: it renders once per frame
	# and the 2D layer composits over it, so nothing in the scene can occlude the
	# title even if the first 3D frame is late.
	_sub = SubViewport.new()
	_sub.size = Vector2i(1280, 720)
	_sub.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sub.transparent_bg = false
	_sub.handle_input_locally = false
	_sub.own_world_3d = true
	content.add_child(_sub)

	var show = ShowroomScript.new()
	show.name = "Showroom"
	_sub.add_child(show)
	if not show.setup(_hero_paint()):
		# 3D unavailable: drop the viewport entirely and let the gradient carry it.
		show.queue_free()
		_sub.queue_free()
		_sub = null
		_showroom = null
		return
	_showroom = show

	var view := TextureRect.new()
	view.texture = _sub.get_texture()
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	view.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Fade the studio in rather than popping it: the first frame is also the
	# shader's first compile, and a fade covers that without a stutter.
	view.modulate.a = 0.0
	content.add_child(view)
	var fade := create_tween()
	fade.tween_property(view, "modulate:a", 1.0, 1.1).set_ease(Tween.EASE_OUT)

	# letterbox bars: the cheapest way to make a scene read as cinema
	for side in [0, 1]:
		var bar = ColorRect.new()
		bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
		if side == 1:
			bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		bar.offset_top = 0.0 if side == 0 else -74.0
		bar.offset_bottom = 74.0 if side == 0 else 0.0
		bar.color = Color(0.0, 0.0, 0.0, 0.92)
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_child(bar)

	# bottom fade so the loading rail always has contrast behind it
	_vignette = ColorRect.new()
	_vignette.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_vignette.offset_top = -430.0
	_vignette.color = Color(0.004, 0.005, 0.010, 0.78)
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(_vignette)


func _hero_paint() -> Color:
	var rec: Dictionary = Game.selected_car()
	var pid := str(rec.get("paint", "cyan")) if not rec.is_empty() else "cyan"
	var info: Dictionary = GameData.paint_by_id(pid)
	var hex := str(info.get("color", "22e9ff"))
	if hex.length() >= 6:
		return Color(hex)
	return Color(0.13, 0.91, 1.0)


func _build_streaks() -> void:
	_streak_root = Control.new()
	_streak_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_streak_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_streak_root.modulate.a = 0.0
	content.add_child(_streak_root)
	for i in SEGMENTS:
		var s = ColorRect.new()
		var w: float = 2.0 + float(i % 3)
		s.size = Vector2(w, 60.0 + float(i % 5) * 34.0)
		s.position = Vector2(float(i) * 96.0 + 24.0, -160.0)
		s.color = Color(1, 1, 1, 0.05 + 0.02 * float(i % 4))
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_streak_root.add_child(s)
		var tw = create_tween().set_loops()
		tw.tween_property(s, "position:y", 900.0, 2.6 + 0.3 * float(i % 4)) \
			.set_delay(0.16 * float(i)) \
			.set_trans(Tween.TRANS_LINEAR)
		tw.tween_callback(func(): s.position.y = -160.0)


## Brand lockup. Placed low-left rather than centred: a centred wordmark over the
## car fights the subject, and every car advert puts the type off-axis.
func _build_logo() -> void:
	_logo_block = VBoxContainer.new()
	_logo_block.anchor_left = 0.0
	_logo_block.anchor_right = 0.62
	_logo_block.anchor_top = 1.0
	_logo_block.anchor_bottom = 1.0
	_logo_block.offset_left = 92.0
	_logo_block.offset_top = -352.0
	_logo_block.offset_bottom = -196.0
	_logo_block.offset_right = 0.0
	_logo_block.alignment = BoxContainer.ALIGNMENT_END
	_logo_block.add_theme_constant_override("separation", -18)
	content.add_child(_logo_block)

	var kicker = UIStyle.make_kicker("SEASON 1  ·  NEON DISTRICT", UIStyle.CYAN, 21)
	kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	kicker.modulate.a = 0.0
	_logo_block.add_child(kicker)

	var logo = UIStyle.make_title("APEX", 132, Color.WHITE, HORIZONTAL_ALIGNMENT_LEFT)
	logo.modulate.a = 0.0
	_logo_block.add_child(logo)

	var logo2 = UIStyle.make_title("VELOCITY", 132, UIStyle.CYAN, HORIZONTAL_ALIGNMENT_LEFT)
	logo2.modulate.a = 0.0
	_logo_block.add_child(logo2)

	var tagline = UIStyle.make_label(Localization.t("menu.tagline"), "body", 24, UIStyle.TEXT_DIM,
		HORIZONTAL_ALIGNMENT_LEFT)
	tagline.modulate.a = 0.0
	_logo_block.add_child(tagline)

	# Slide the lockup up into place as it fades: motion in the same direction as
	# the camera dolly so the two do not fight.
	_logo_block.position.y += 26.0
	var tw = create_tween()
	tw.tween_property(_logo_block, "position:y", _logo_block.position.y - 26.0, 1.05) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(kicker, "modulate:a", 1.0, 0.55)
	tw.parallel().tween_property(logo, "modulate:a", 1.0, 0.80)
	tw.parallel().tween_property(logo2, "modulate:a", 1.0, 0.80)
	tw.parallel().tween_property(tagline, "modulate:a", 1.0, 0.70).set_delay(0.35)
	tw.parallel().tween_property(_streak_root, "modulate:a", 1.0, 1.2)


func _build_progress() -> void:
	var v = VBoxContainer.new()
	v.anchor_left = 0.0
	v.anchor_right = 1.0
	v.anchor_top = 1.0
	v.anchor_bottom = 1.0
	v.offset_top = -158
	v.offset_bottom = -96
	v.offset_left = 92
	v.offset_right = -92
	v.add_theme_constant_override("separation", 10)
	v.alignment = BoxContainer.ALIGNMENT_END
	content.add_child(v)

	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	v.add_child(row)

	_status = UIStyle.make_kicker(Localization.t("boot.loading"), UIStyle.TEXT_DIM, 19)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.modulate.a = 0.0
	row.add_child(_status)

	_bar_pct = UIStyle.make_label("6%", "numeric", 19, UIStyle.CYAN)
	_bar_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_bar_pct.modulate.a = 0.0
	row.add_child(_bar_pct)

	var rail = ColorRect.new()
	rail.custom_minimum_size = Vector2(0, 6)
	rail.color = Color(1, 1, 1, 0.09)
	rail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var wrapper = Control.new()
	wrapper.custom_minimum_size = Vector2(0, 6)
	v.add_child(wrapper)
	rail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wrapper.add_child(rail)

	_bar = UIStyle.make_progress_bar(0.0, UIStyle.CYAN, 6)
	_bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wrapper.add_child(_bar)
	_bar.value = 6.0

	var fade = create_tween()
	fade.tween_property(_status, "modulate:a", 1.0, 0.6)
	fade.parallel().tween_property(_bar_pct, "modulate:a", 1.0, 0.6)


const STEPS := [
	["loading_assets", "res://assets/audio/music/menu_theme.ogg"],
	["tuning", "res://scripts/vehicle/CarModel.gd"],
	["track", "res://scripts/race/TrackLibrary.gd"],
	["warming", "res://shaders/car_paint.gdshader"],
]


## The bar reports real work: each step loads a resource the first screen needs,
## so progress cannot claim to be finished before it is, and the shader warm-up
## front-loads the compile that would otherwise hitch the first race.
func _run_sequence() -> void:
	await get_tree().create_timer(1.15).timeout
	var loaded: Array = []
	for i in STEPS.size():
		var step: Array = STEPS[i]
		var key := str(step[0])
		var path := str(step[1])
		var label: String = Localization.t("boot." + key) if Localization.tr_key("boot." + key) != "boot." + key else key.to_upper()
		if ResourceLoader.exists(path):
			var res = load(path)
			if res != null:
				loaded.append(res)
		var pct: float = 20.0 + 20.0 * float(i + 1)
		_bar.value = pct
		_bar_pct.text = "%d%%" % int(pct)
		_status.text = label
		await get_tree().process_frame
	_status.text = Localization.t("boot.ready")
	_bar.value = 100.0
	_bar_pct.text = "100%"
	# hold the finished shot for a beat so the car is actually looked at
	await get_tree().create_timer(0.85).timeout
	if _showroom != null:
		_showroom.teardown()
	router.replace("menu")
