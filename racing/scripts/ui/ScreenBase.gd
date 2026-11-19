extends Control
## Base class for every UI screen. Handles the animated backdrop, the nav bar
## and entrance animation so individual screens only describe their content.

var router
var params: Dictionary = {}

var content: Control
var _bg_layer: Control
var _in_anim = true


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_backdrop()
	content = Control.new()
	content.name = "Content"
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(content)
	build()
	AudioDirector.play_music("menu_theme")
	_animate_in()


func build() -> void:
	pass


func _build_backdrop() -> void:
	var base = ColorRect.new()
	base.color = UIStyle.INK
	base.set_anchors_preset(Control.PRESET_FULL_RECT)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(base)
	_bg_layer = UIStyle.make_aurora(UIStyle.CYAN, UIStyle.MAGENTA, 0.30)
	add_child(_bg_layer)
	var vig = UIStyle.make_vignette(0.82)
	add_child(vig)


func _animate_in() -> void:
	content.modulate.a = 0.0
	content.scale = Vector2(0.985, 0.985)
	content.pivot_offset = size * 0.5
	var tw = create_tween()
	tw.set_parallel(true)
	tw.tween_property(content, "modulate:a", 1.0, 0.30)
	tw.tween_property(content, "scale", Vector2.ONE, 0.42).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func go(scene_id: String, p: Dictionary = {}, push_history: bool = true) -> void:
	router.goto(scene_id, p, push_history)


func back() -> void:
	router.back()


func fmt_credits(v: int) -> String:
	return Game.format_credits(v)


func top_bar(title: String, show_back: bool = true, show_currency: bool = true) -> HBoxContainer:
	var bar = HBoxContainer.new()
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	bar.offset_left = 44
	bar.offset_right = -44
	bar.offset_top = 36
	bar.offset_bottom = 140
	bar.add_theme_constant_override("separation", 20)
	content.add_child(bar)
	if show_back:
		var b = UIStyle.make_icon_button("back", 78, UIStyle.CYAN)
		b.pressed.connect(back)
		bar.add_child(b)
	var col = VBoxContainer.new()
	col.add_theme_constant_override("separation", -8)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(col)
	col.add_child(UIStyle.make_kicker(Localization.t("app.title"), UIStyle.CYAN, 16))
	col.add_child(UIStyle.make_title(title, 54, UIStyle.CYAN))
	if show_currency:
		bar.add_child(_credits_chip())
		bar.add_child(_level_chip())
	return bar


func _credits_chip() -> Control:
	var p = UIStyle.make_glass_panel(20, Color(0.05, 0.08, 0.14, 0.8), 16)
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	p.add_child(h)
	var ic = TextureRect.new()
	ic.texture = UIStyle.icon("coin")
	ic.custom_minimum_size = Vector2(30, 30)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	h.add_child(ic)
	var lbl = UIStyle.make_label(fmt_credits(Game.credits()), "numeric", 28, UIStyle.GOLD)
	lbl.name = "CreditsLabel"
	h.add_child(lbl)
	return p


func _level_chip() -> Control:
	var p = UIStyle.make_glass_panel(20, Color(0.05, 0.08, 0.14, 0.8), 16)
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	p.add_child(h)
	var ic = TextureRect.new()
	ic.texture = UIStyle.icon("star")
	ic.custom_minimum_size = Vector2(28, 28)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	h.add_child(ic)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", -10)
	h.add_child(v)
	v.add_child(UIStyle.make_kicker(Localization.t("common.level"), UIStyle.TEXT_DIM, 12))
	v.add_child(UIStyle.make_label(str(Game.level()), "numeric", 26, UIStyle.CYAN))
	return p
