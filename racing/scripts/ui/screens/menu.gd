extends "res://scripts/ui/ScreenBase.gd"
## Main menu: hero art, car showcase, primary actions, quick stats.

const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")

var _car_view: SubViewportContainer
var _car_vp: SubViewport
var _car_cam: Camera3D
var _car_pivot: Node3D
var _turn_ring: MeshInstance3D
var _showcase_t = 0.0


func build() -> void:
	_add_hero()
	_add_left_column()
	_add_quick_actions()
	_add_car_showcase()
	_add_footer_stats()


func _add_hero() -> void:
	# A slow cross-fade across the four shipped region paintings: the same places
	# the player will actually drive, so the menu sells the world, not a poster.
	var art = UIStyle.make_crossfade_backdrop(UIStyle.REGION_ART, 7.0)
	content.add_child(art)
	move_child(art, 0)
	var title_block = VBoxContainer.new()
	title_block.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	title_block.offset_left = 84
	title_block.offset_top = 84
	title_block.offset_right = 760
	title_block.add_theme_constant_override("separation", -14)
	content.add_child(title_block)
	var kicker = UIStyle.make_kicker("SEASON 1  ·  NEON DISTRICT", UIStyle.CYAN, 22)
	title_block.add_child(kicker)
	var t1 = UIStyle.make_title("APEX", 92, UIStyle.CYAN)
	t1.add_theme_constant_override("outline_size", 0)
	title_block.add_child(t1)
	var t2 = UIStyle.make_title("VELOCITY", 92, UIStyle.MAGENTA)
	title_block.add_child(t2)
	var sub = UIStyle.make_label(Localization.t("menu.tagline"), "body", 26, UIStyle.TEXT_DIM)
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
	col.offset_right = 640
	col.add_theme_constant_override("separation", 14)
	content.add_child(col)
	var play = UIStyle.make_button(Localization.t("menu.race"), UIStyle.CYAN, true, 32, 92)
	play.pressed.connect(func(): go("tracks"))
	col.add_child(play)
	var garage = UIStyle.make_button(Localization.t("menu.garage"), UIStyle.MAGENTA, false, 28, 80)
	garage.pressed.connect(func(): go("garage"))
	col.add_child(garage)
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	col.add_child(row)
	for spec in [["shop", Localization.t("menu.shop")], ["achievements", Localization.t("menu.achievements")]]:
		var b = UIStyle.make_button(spec[1], UIStyle.VIOLET, false, 22, 72)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func(): go(spec[0]))
		row.add_child(b)
	var row2 = HBoxContainer.new()
	row2.add_theme_constant_override("separation", 16)
	col.add_child(row2)
	for spec in [["settings", Localization.t("menu.settings")], ["credits", Localization.t("menu.credits")]]:
		var b = UIStyle.make_button(spec[1], UIStyle.TEXT_DIM, false, 20, 64)
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
	_car_view.anchor_left = 0.46
	_car_view.anchor_right = 1.0
	_car_view.anchor_top = 0.11
	_car_view.anchor_bottom = 1.0
	_car_view.offset_left = 0
	_car_view.offset_right = -36
	_car_view.offset_top = 0
	_car_view.offset_bottom = -252
	_car_view.stretch = true
	_car_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(_car_view)
	var vp = SubViewport.new()
	vp.size = Vector2i(1180, 760)
	_car_vp = vp
	# `transparent_bg` only clears to alpha; the Environment still has to opt in
	# with BG_CANVAS. With BG_CLEAR_COLOR the viewport paints an opaque white/blue
	# rectangle that hides the menu artwork behind the car, which is exactly what
	# the screenshot showed: a bright slab where the studio should be.
	vp.transparent_bg = true
	vp.own_world_3d = true
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_car_view.add_child(vp)
	var root = Node3D.new()
	vp.add_child(root)
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_CANVAS
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.40, 0.52, 0.76)
	e.ambient_light_energy = 0.85
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.tonemap_exposure = 1.08
	e.tonemap_white = 6.0
	# SSAO/SSIL are Forward+ only; on the compatibility backend they only emit
	# warnings, and the paint shader already fakes contact shading.
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.glow_enabled = true
	e.glow_intensity = 0.7
	e.glow_bloom = 0.05
	e.glow_hdr_threshold = 1.0
	e.adjustment_enabled = true
	e.adjustment_saturation = 1.08
	e.adjustment_contrast = 1.04
	env.environment = e
	root.add_child(env)
	# Three-point studio rig. Energies are low on purpose: ACES tone mapping plus
	# a reflective floor means a 3.4-energy key clips every top-facing panel.
	var key = DirectionalLight3D.new()
	key.light_color = Color(0.88, 0.94, 1.0)
	key.light_energy = 1.5
	key.rotation_degrees = Vector3(-34, -132, 0)
	root.add_child(key)
	var rim = DirectionalLight3D.new()
	rim.light_color = Color(1.0, 0.25, 0.66)
	rim.light_energy = 2.0
	rim.rotation_degrees = Vector3(-8, 58, 0)
	root.add_child(rim)
	var fill = DirectionalLight3D.new()
	fill.light_color = Color(0.16, 0.85, 1.0)
	fill.light_energy = 0.9
	fill.rotation_degrees = Vector3(-44, 148, 0)
	root.add_child(fill)
	# soft top light so the roof and wing never go to pure black
	var top = DirectionalLight3D.new()
	top.light_color = Color(0.75, 0.85, 1.0)
	top.light_energy = 0.7
	top.rotation_degrees = Vector3(-90, 0, 0)
	root.add_child(top)
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
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	_car_cam = cam
	root.add_child(cam)
	# look_at() needs the node inside the tree, otherwise the camera keeps an
	# identity basis and points away from the car.
	cam.position = Vector3(9.4, 3.0, 10.6)
	cam.look_at(Vector3(0, 0.45, 0), Vector3.UP)
	cam.current = true
	# Mirror showroom floor: a large plane with a high metallic / low roughness
	# material, so the paint and the rim lights reflect into the ground the way a
	# detailing studio floor does. The turntable ring sits on top of it.
	var floor_mi = MeshInstance3D.new()
	# A flat 60 m plane read as a huge bright slab behind the car: four
	# directional lights with no shadows, a metallic floor and ACES tone mapping
	# clipped it to white, and its square edges were visible against the artwork.
	# A round podium cannot do that — it is small, unshaded and deliberately dark,
	# so no lighting rig can blow it out, and it reads as a studio stage rather
	# than a painted rectangle.
	var podium = CylinderMesh.new()
	podium.top_radius = 4.55
	podium.bottom_radius = 4.75
	podium.height = 0.16
	podium.radial_segments = 64
	podium.rings = 1
	floor_mi.mesh = podium
	var fmat = StandardMaterial3D.new()
	fmat.albedo_color = Color(0.026, 0.032, 0.048)
	fmat.metallic = 0.18
	fmat.roughness = 0.55
	# unshaded would kill the rim light bleeding across the stage, so keep it lit
	# but pin the exposure with a very low albedo; the cyan ring does the drama.
	fmat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	floor_mi.material_override = fmat
	floor_mi.position = Vector3(0, -0.46, 0)
	root.add_child(floor_mi)
	# glowing turntable ring under the car
	var ring = MeshInstance3D.new()
	var tm = TorusMesh.new()
	tm.inner_radius = 3.05
	tm.outer_radius = 3.28
	tm.rings = 64
	tm.ring_segments = 12
	ring.mesh = tm
	var rmat = StandardMaterial3D.new()
	rmat.albedo_color = UIStyle.CYAN
	rmat.emission_enabled = true
	rmat.emission = UIStyle.CYAN
	rmat.emission_energy_multiplier = 2.6
	rmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = rmat
	ring.position = Vector3(0, -0.37, 0)
	root.add_child(ring)
	_turn_ring = ring
	# nameplate
	var plate = UIStyle.make_glass_panel(24, Color(0.03, 0.05, 0.1, 0.72), 22, 0.25)
	plate.anchor_left = 0.62
	plate.anchor_right = 1.0
	plate.anchor_top = 1.0
	plate.anchor_bottom = 1.0
	plate.offset_left = 0
	plate.offset_right = -84
	plate.offset_top = -212
	plate.offset_bottom = -36
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
	if _car_view and _car_cam:
		var stage = _car_view.size
		if stage.x > 8.0 and stage.y > 8.0:
			var want = Vector2i(int(stage.x), int(stage.y))
			if _car_vp.size != want and want.x <= 2048 and want.y <= 2048:
				_car_vp.size = want
			_car_cam.keep_aspect = Camera3D.KEEP_HEIGHT
			_car_cam.fov = rad_to_deg(2.0 * atan(tan(deg_to_rad(11.5)) * (stage.y / stage.x) * 1.15))
	_showcase_t += delta
	if _car_pivot:
		_car_pivot.rotation.y = sin(_showcase_t * 0.32) * 0.55 + 0.35
		# the turntable ring counter-rotates so the car always looks like it is
		# standing on a live stage rather than a static prop
		if _turn_ring:
			_turn_ring.rotation.y = -_showcase_t * 0.42
			var pulse = 2.2 + 0.7 * sin(_showcase_t * 2.1)
			var rm: StandardMaterial3D = _turn_ring.material_override
			if rm:
				rm.emission_energy_multiplier = pulse
	var credits_lbl = content.find_child("CreditsLabel", true, false)
	if credits_lbl is Label:
		credits_lbl.text = fmt_credits(Game.credits())
