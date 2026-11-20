extends "res://scripts/ui/ScreenBase.gd"
## Main menu: hero art, car showcase, primary actions, quick stats.

const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")

var _car_view: SubViewportContainer
var _car_pivot: Node3D
var _showcase_t = 0.0


func build() -> void:
	_add_hero()
	_add_left_column()
	_add_quick_actions()
	_add_car_showcase()
	_add_footer_stats()


func _add_hero() -> void:
	var art = UIStyle.make_art_background("menu_hero")
	content.add_child(art)
	var title_block = VBoxContainer.new()
	title_block.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	title_block.offset_left = 84
	title_block.offset_top = 96
	title_block.offset_right = 1000
	title_block.add_theme_constant_override("separation", -14)
	content.add_child(title_block)
	var kicker = UIStyle.make_kicker("SEASON 1  ·  NEON DISTRICT", UIStyle.CYAN, 22)
	title_block.add_child(kicker)
	var t1 = UIStyle.make_title("APEX", 132, UIStyle.CYAN)
	t1.add_theme_constant_override("outline_size", 0)
	title_block.add_child(t1)
	var t2 = UIStyle.make_title("VELOCITY", 132, UIStyle.MAGENTA)
	title_block.add_child(t2)
	var sub = UIStyle.make_label(Localization.t("menu.tagline"), "body", 30, UIStyle.TEXT_DIM)
	title_block.add_child(sub)
	# animate the kicker
	var tw = create_tween().set_loops()
	tw.tween_property(kicker, "modulate:a", 0.45, 1.4).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(kicker, "modulate:a", 1.0, 1.4).set_ease(Tween.EASE_IN_OUT)


func _add_left_column() -> void:
	var col = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	col.offset_left = 84
	col.offset_top = 470
	col.offset_right = 620
	col.add_theme_constant_override("separation", 16)
	content.add_child(col)
	var play = UIStyle.make_button(Localization.t("menu.race"), UIStyle.CYAN, true, 34, 96)
	play.pressed.connect(func(): go("tracks"))
	col.add_child(play)
	var garage = UIStyle.make_button(Localization.t("menu.garage"), UIStyle.MAGENTA, false, 30, 84)
	garage.pressed.connect(func(): go("garage"))
	col.add_child(garage)
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	col.add_child(row)
	for spec in [["shop", Localization.t("menu.shop")], ["achievements", Localization.t("menu.achievements")]]:
		var b = UIStyle.make_button(spec[1], UIStyle.VIOLET, false, 24, 76)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func(): go(spec[0]))
		row.add_child(b)
	var row2 = HBoxContainer.new()
	row2.add_theme_constant_override("separation", 16)
	col.add_child(row2)
	for spec in [["settings", Localization.t("menu.settings")], ["credits", Localization.t("menu.credits")]]:
		var b = UIStyle.make_button(spec[1], UIStyle.TEXT_DIM, false, 22, 68)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func(): go(spec[0]))
		row2.add_child(b)


func _add_quick_actions() -> void:
	var bar = HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	bar.anchor_left = 1.0
	bar.anchor_right = 1.0
	bar.offset_left = -1120
	bar.offset_right = -84
	bar.offset_top = 96
	bar.offset_bottom = 172
	bar.add_theme_constant_override("separation", 12)
	bar.alignment = BoxContainer.ALIGNMENT_END
	content.add_child(bar)
	var cr = _credits_chip()
	bar.add_child(cr)
	bar.add_child(_level_chip())
	var daily = UIStyle.make_icon_button("trophy", 68, UIStyle.GOLD)
	daily.tooltip_text = Localization.t("menu.daily")
	daily.pressed.connect(func(): go("daily"))
	bar.add_child(daily)
	var ach = UIStyle.make_icon_button("star", 68, UIStyle.AMBER)
	ach.pressed.connect(func(): go("achievements"))
	bar.add_child(ach)
	var set_btn = UIStyle.make_icon_button("settings", 68, UIStyle.TEXT_DIM)
	set_btn.pressed.connect(func(): go("settings"))
	bar.add_child(set_btn)


func _add_car_showcase() -> void:
	_car_view = SubViewportContainer.new()
	_car_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_car_view.anchor_left = 0.28
	_car_view.anchor_right = 1.0
	_car_view.anchor_top = 0.16
	_car_view.anchor_bottom = 1.0
	_car_view.offset_left = 0
	_car_view.offset_right = -40
	_car_view.offset_top = 0
	_car_view.offset_bottom = -250
	_car_view.stretch = true
	_car_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(_car_view)
	var vp = SubViewport.new()
	vp.size = Vector2i(1280, 760)
	vp.transparent_bg = true
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_car_view.add_child(vp)
	var root = Node3D.new()
	vp.add_child(root)
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.45, 0.55, 0.75)
	e.ambient_light_energy = 1.9
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.glow_enabled = true
	e.glow_intensity = 0.9
	e.glow_bloom = 0.15
	env.environment = e
	root.add_child(env)
	var key = DirectionalLight3D.new()
	key.light_color = Color(0.85, 0.93, 1.0)
	key.light_energy = 3.4
	key.rotation_degrees = Vector3(-28, -135, 0)
	root.add_child(key)
	var rim = DirectionalLight3D.new()
	rim.light_color = UIStyle.MAGENTA
	rim.light_energy = 3.2
	rim.rotation_degrees = Vector3(-10, 55, 0)
	root.add_child(rim)
	var fill = DirectionalLight3D.new()
	fill.light_color = UIStyle.CYAN
	fill.light_energy = 1.6
	fill.rotation_degrees = Vector3(-40, 150, 0)
	root.add_child(fill)
	_car_pivot = Node3D.new()
	root.add_child(_car_pivot)
	var car = Game.selected_car()
	if car.is_empty():
		car = GameData.CARS[0]
	var rec: Dictionary = Game.car_record(str(car["id"]))
	var model = CarModelScript.new()
	model.build(car, str(rec.get("paint", car.get("paint", "cyan"))), str(rec.get("rim", "stock")))
	model.position = Vector3(0, -0.42, 0)
	_car_pivot.add_child(model)
	var cam = Camera3D.new()
	cam.fov = 30.0
	cam.keep_aspect = Camera3D.KEEP_WIDTH
	root.add_child(cam)
	# look_at() needs the node inside the tree, otherwise the camera keeps an
	# identity basis and points away from the car.
	cam.position = Vector3(5.2, 1.7, 6.0)
	cam.look_at(Vector3(0, 0.30, 0), Vector3.UP)
	cam.current = true
	# floor glow ellipse
	var disc = MeshInstance3D.new()
	var dm = CylinderMesh.new()
	dm.top_radius = 3.2
	dm.bottom_radius = 3.2
	dm.height = 0.02
	disc.mesh = dm
	var dmat = StandardMaterial3D.new()
	dmat.albedo_color = Color(0.05, 0.3, 0.45, 0.35)
	dmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dmat.emission_enabled = true
	dmat.emission = UIStyle.CYAN
	dmat.emission_energy_multiplier = 0.55
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disc.material_override = dmat
	disc.position = Vector3(0, -0.40, 0)
	root.add_child(disc)
	# nameplate
	var plate = UIStyle.make_glass_panel(24, Color(0.03, 0.05, 0.1, 0.72), 22, 0.25)
	plate.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	plate.anchor_right = 1.0
	plate.anchor_bottom = 1.0
	plate.offset_left = -700
	plate.offset_right = -84
	plate.offset_top = -214
	plate.offset_bottom = -40
	content.add_child(plate)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	plate.add_child(v)
	v.add_child(UIStyle.make_kicker(Localization.t("menu.current_car"), UIStyle.TEXT_DIM, 16))
	v.add_child(UIStyle.make_title(str(car["name"]), 48, GameData.CLASS_INFO[str(car["class"])]["color"]))
	var stats: Dictionary = Game.tuned_stats(str(car["id"]))
	v.add_child(UIStyle.make_stat_bar(Localization.t("common.speed"), float(stats["speed"]),
		UIStyle.CYAN, 10, 560))
	v.add_child(UIStyle.make_stat_bar(Localization.t("common.accel"), float(stats["accel"]),
		UIStyle.MAGENTA, 10, 560))


func _add_footer_stats() -> void:
	var strip = HBoxContainer.new()
	strip.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	strip.offset_left = 84
	strip.offset_bottom = -40
	strip.offset_top = -120
	strip.add_theme_constant_override("separation", 34)
	content.add_child(strip)
	var st: Dictionary = Game.data.get("stats", {})
	var items = [
		[Localization.t("stats.races"), str(int(st.get("races", 0)))],
		[Localization.t("stats.wins"), str(int(st.get("wins", 0)))],
		[Localization.t("stats.distance"), "%.1f KM" % float(st.get("distance_km", 0.0))],
		[Localization.t("stats.cars"), "%d / %d" % [Game.owned_count(), GameData.CARS.size()]],
	]
	for item in items:
		var v = VBoxContainer.new()
		v.add_theme_constant_override("separation", -6)
		var val = UIStyle.make_label(item[1], "numeric", 34, Color.WHITE)
		v.add_child(val)
		v.add_child(UIStyle.make_kicker(item[0], UIStyle.TEXT_DIM, 14))
		strip.add_child(v)


func _process(delta: float) -> void:
	_showcase_t += delta
	if _car_pivot:
		_car_pivot.rotation.y = sin(_showcase_t * 0.32) * 0.55 + 0.35
	var credits_lbl = content.find_child("CreditsLabel", true, false)
	if credits_lbl is Label:
		credits_lbl.text = fmt_credits(Game.credits())
