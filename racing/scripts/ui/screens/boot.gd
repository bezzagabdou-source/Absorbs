extends "res://scripts/ui/ScreenBase.gd"
## Boot / splash: logo reveal, loading bar with staged messages, then the main
## menu. Also the entry point used by the CI scene-load test.

var _status: Label
var _bar: ProgressBar


func build() -> void:
	AudioDirector.play_music("menu_theme", 0.8, -14.0)
	var v = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 6)
	content.add_child(v)
	var logo = UIStyle.make_title("APEX", 168, UIStyle.CYAN, HORIZONTAL_ALIGNMENT_CENTER)
	logo.modulate.a = 0.0
	v.add_child(logo)
	var logo2 = UIStyle.make_title("VELOCITY", 168, UIStyle.MAGENTA, HORIZONTAL_ALIGNMENT_CENTER)
	logo2.modulate.a = 0.0
	v.add_child(logo2)
	_status = UIStyle.make_kicker(Localization.t("boot.loading"), UIStyle.TEXT_DIM, 20)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.modulate.a = 0.0
	v.add_child(_status)
	var bar_wrap = CenterContainer.new()
	v.add_child(bar_wrap)
	_bar = UIStyle.make_progress_bar(0.0, UIStyle.CYAN, 8)
	_bar.custom_minimum_size = Vector2(520, 8)
	bar_wrap.add_child(_bar)
	var tw = create_tween()
	tw.set_parallel(true)
	tw.tween_property(logo, "modulate:a", 1.0, 0.45)
	tw.tween_property(logo, "position:y", logo.position.y - 10.0, 0.6).set_trans(Tween.TRANS_CUBIC)
	tw.chain().tween_property(logo2, "modulate:a", 1.0, 0.35)
	tw.chain().tween_property(_status, "modulate:a", 1.0, 0.25)
	_bar.value = 18.0
	await get_tree().create_timer(0.35).timeout
	for step in [[46.0, "LOADING ASSETS"], [72.0, "TUNING ENGINES"], [92.0, "WARMING TYRES"]]:
		_bar.value = float(step[0])
		_status.text = str(step[1])
		await get_tree().create_timer(0.28).timeout
	_bar.value = 100.0
	_status.text = Localization.t("boot.ready")
	await get_tree().create_timer(0.35).timeout
	router.replace("menu")
