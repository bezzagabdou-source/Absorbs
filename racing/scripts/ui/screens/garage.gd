extends "res://scripts/ui/ScreenBase.gd"
## Garage: live 3D preview (drag to rotate, pinch/scroll to zoom), car list with
## class filter, paint + rim fitting, engine/tire/turbo upgrade tree.

const CarModelScript = preload("res://scripts/vehicle/CarModel.gd")

var _car_pivot: Node3D
var _car_model: Node3D
var _cam: Camera3D
var _yaw = 0.55
var _pitch = 0.0
var _dist = 11.5
var _dragging = false
var _class_filter = "all"
var _car_index = 0
var _view_id = ""
var _list_box: VBoxContainer
var _stats_box: VBoxContainer
var _paint_box: VBoxContainer
var _rim_box: VBoxContainer
var _upgrade_box: VBoxContainer
var _tab = "tune"
var _tab_row: HBoxContainer
var _name_label: Label
var _price_label: Label
var _action_btn: Button
var _spin_lock = true


func build() -> void:
	top_bar(Localization.t("garage.title"))
	_build_viewport()
	_build_list()
	_build_side_panel()
	_view_id = Game.selected_car_id()
	_select_car(_view_id)


func _build_viewport() -> void:
	var container = SubViewportContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.anchor_left = 0.0
	container.anchor_right = 1.0
	container.offset_left = 430
	container.offset_right = -722
	container.offset_top = 150
	container.offset_bottom = -40
	container.stretch = true
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	content.add_child(container)
	var vp = SubViewport.new()
	vp.size = Vector2i(1400, 900)
	vp.transparent_bg = true
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	container.add_child(vp)
	var root = Node3D.new()
	vp.add_child(root)
	var env = WorldEnvironment.new()
	var e = Environment.new()
	# BG_CANVAS + transparent_bg is the only combination that lets the garage's
	# own artwork show through behind the car; BG_CLEAR_COLOR paints an opaque
	# slab over it.
	e.background_mode = Environment.BG_CANVAS
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.52, 0.56, 0.64)
	e.ambient_light_energy = 0.85
	e.ambient_light_sky_contribution = 0.0
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.glow_enabled = true
	e.glow_intensity = 0.95
	e.glow_bloom = 0.14
	e.glow_hdr_threshold = 1.05
	# The car sits ON the turntable, and without contact shading it reads as
	# pasted on: no shadow in the wheel wells, none under the splitter, none
	# where the sills meet the disc.
	#
	# The Compatibility backend has no SSAO at all, so the cheating version is
	# used instead: a soft dark disc under the car plus a real shadow-casting key
	# light. That combination is what actually produces the contact shadow on
	# this renderer, and it costs one draw call rather than a depth prepass.
	var forward_plus: bool = RenderingServer.get_current_rendering_method() == "forward_plus"
	e.ssao_enabled = forward_plus
	if forward_plus:
		e.ssao_radius = 0.85
		e.ssao_intensity = 2.6
		e.ssao_power = 2.0
		e.ssao_detail = 0.8
		e.ssao_light_affect = 0.12
		e.ssao_horizon = 0.04
		e.ssr_enabled = true
		e.ssr_max_steps = 36
		e.ssr_fade_in = 0.1
		e.ssr_fade_out = 1.4
	env.environment = e
	root.add_child(env)
	var key = DirectionalLight3D.new()
	key.light_color = Color(0.9, 0.95, 1.0)
	key.light_energy = 1.15
	key.rotation_degrees = Vector3(-32, -140, 0)
	# Shadows on: this is the contact shadow on the compatibility renderer. Set
	# to a tight 26 m range so the shadow texels stay small and the car's own
	# shadow is sharp instead of a fuzzy blob.
	key.shadow_enabled = true
	key.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	key.directional_shadow_max_distance = 26.0
	key.shadow_bias = 0.02
	key.shadow_normal_bias = 1.4
	root.add_child(key)
	# Studio rig: a warm key from the front-left, a cool fill from the right and a
	# hard rim from behind. This is how a car is actually lit for a photograph —
	# the old magenta key tinted every paint colour purple and made the whole
	# garage feel like a nightclub rather than a showroom.
	var rim = DirectionalLight3D.new()
	rim.light_color = Color(1.0, 0.93, 0.84)
	rim.light_energy = 1.55
	rim.rotation_degrees = Vector3(-14, 22, 0)
	root.add_child(rim)
	var back = DirectionalLight3D.new()
	back.light_color = Color(0.72, 0.84, 1.0)
	back.light_energy = 1.10
	back.rotation_degrees = Vector3(-24, 196, 0)
	root.add_child(back)
	# floor bounce: a soft upward light so the sills and the underside of the
	# splitter are not black holes, which is what makes a car look like it is
	# floating on the turntable
	var bounce = OmniLight3D.new()
	bounce.light_color = Color(0.85, 0.88, 1.0)
	bounce.light_energy = 1.35
	bounce.omni_range = 9.0
	bounce.position = Vector3(0, 0.35, 0)
	root.add_child(bounce)
	var fill2 = DirectionalLight3D.new()
	fill2.light_color = UIStyle.CYAN
	fill2.light_energy = 0.70
	fill2.rotation_degrees = Vector3(-50, 160, 0)
	root.add_child(fill2)
	_car_pivot = Node3D.new()
	root.add_child(_car_pivot)
	var disc = MeshInstance3D.new()
	var dm = CylinderMesh.new()
	dm.top_radius = 3.2
	dm.bottom_radius = 3.2
	dm.height = 0.02
	disc.mesh = dm
	var dmat = StandardMaterial3D.new()
	dmat.albedo_color = Color(0.06, 0.22, 0.34, 0.55)
	dmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dmat.emission_enabled = true
	dmat.emission = UIStyle.CYAN
	dmat.emission_energy_multiplier = 0.4
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disc.material_override = dmat
	disc.position = Vector3(0, -0.02, 0)
	root.add_child(disc)
	var ring = MeshInstance3D.new()
	var rmesh = TorusMesh.new()
	rmesh.inner_radius = 3.3
	rmesh.outer_radius = 3.42
	ring.mesh = rmesh
	var rmat = StandardMaterial3D.new()
	rmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rmat.albedo_color = UIStyle.CYAN
	rmat.emission_enabled = true
	rmat.emission = UIStyle.CYAN
	rmat.emission_energy_multiplier = 2.6
	ring.material_override = rmat
	ring.position = Vector3(0, -0.02, 0)
	root.add_child(ring)
	_cam = Camera3D.new()
	_cam.fov = 40.0
	_cam.keep_aspect = Camera3D.KEEP_WIDTH
	root.add_child(_cam)
	_cam.current = true
	_update_cam()
	container.gui_input.connect(_on_view_input)


func _on_view_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb = event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			_dist = clampf(_dist - 0.5, 4.4, 12.0)
			_update_cam()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_dist = clampf(_dist + 0.5, 4.4, 12.0)
			_update_cam()
	elif event is InputEventMouseMotion and _dragging:
		var mm = event as InputEventMouseMotion
		_yaw += mm.relative.x * 0.011
		_pitch = clampf(_pitch + mm.relative.y * 0.006, -0.35, 0.7)
		_update_cam()
	elif event is InputEventScreenDrag:
		var sd = event as InputEventScreenDrag
		_yaw += sd.relative.x * 0.011
		_pitch = clampf(_pitch + sd.relative.y * 0.006, -0.35, 0.7)
		_update_cam()


func _update_cam() -> void:
	if _cam == null:
		return
	var target: Vector3 = Vector3(0, 0.55, 0)
	var offset = Vector3(sin(_yaw) * cos(_pitch), 0.32 + sin(_pitch), cos(_yaw) * cos(_pitch)) * _dist
	_cam.position = target + offset
	_cam.look_at(target, Vector3.UP)


func _process(_delta: float) -> void:
	if _car_pivot and not _dragging:
		_yaw += _delta * 0.18
		_update_cam()


func _build_list() -> void:
	var panel = UIStyle.make_glass_panel(28, Color(0.04, 0.06, 0.11, 0.82), 20)
	panel.set_anchors_and_offsets_preset(Control.PRESET_LEFT_WIDE)
	panel.offset_left = 44
	panel.offset_right = 424
	panel.offset_top = 160
	panel.offset_bottom = -40
	content.add_child(panel)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	panel.add_child(v)
	# Seven class chips no longer fit across a phone in one row at a legible
	# size, so they wrap into a grid of three. tap targets stay 46 px tall.
	var filters = GridContainer.new()
	filters.columns = 3
	filters.add_theme_constant_override("h_separation", 6)
	filters.add_theme_constant_override("v_separation", 6)
	v.add_child(filters)
	for cls in ["all"] + GameData.CLASSES:
		var b = UIStyle.make_button(cls.to_upper(), UIStyle.class_color(cls) if cls != "all" else UIStyle.CYAN, cls == _class_filter, 15, 46)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 46)
		var c = cls
		b.pressed.connect(func(): _set_filter(c))
		filters.add_child(b)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	_list_box = VBoxContainer.new()
	_list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list_box.add_theme_constant_override("separation", 8)
	scroll.add_child(_list_box)
	_refresh_list()


func _set_filter(cls: String) -> void:
	_class_filter = cls
	_refresh_list()


func _refresh_list() -> void:
	for c in _list_box.get_children():
		c.queue_free()
	var i = 0
	for car in GameData.CARS:
		if _class_filter != "all" and str(car["class"]) != _class_filter:
			continue
		_list_box.add_child(_car_row(car, i))
		i += 1


func _car_row(car: Dictionary, idx: int) -> Control:
	var owned = Game.owns(str(car["id"]))
	var selected = str(car["id"]) == Game.selected_car_id()
	var b = Button.new()
	b.custom_minimum_size = Vector2(0, 74)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_stylebox_override("normal", UIStyle.glass_box(16, Color(0.06, 0.09, 0.15, 0.6), 0.1))
	if selected:
		b.add_theme_stylebox_override("normal", UIStyle.accent_box(UIStyle.CYAN, 0.22, 16, 0.25))
	b.add_theme_stylebox_override("hover", UIStyle.accent_box(UIStyle.CYAN, 0.16, 16, 0.2))
	b.add_theme_stylebox_override("pressed", UIStyle.accent_box(UIStyle.CYAN, 0.3, 16, 0.3))
	b.pressed.connect(func(): _select_car(str(car["id"]), idx))
	b.add_theme_constant_override("h_separation", 12)
	var h = HBoxContainer.new()
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	h.offset_left = 14
	h.offset_right = -14
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_constant_override("separation", 12)
	b.add_child(h)
	var swatch = ColorRect.new()
	swatch.color = Color(str(car["color"]))
	swatch.custom_minimum_size = Vector2(8, 0)
	swatch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(swatch)
	var col = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", -6)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(col)
	col.add_child(UIStyle.make_label(str(car["name"]), "bold", 24, Color.WHITE))
	var sub = UIStyle.make_label(str(GameData.CLASS_INFO[str(car["class"])]["label"]).to_upper(), "kicker", 13,
		GameData.CLASS_INFO[str(car["class"])]["color"])
	col.add_child(sub)
	var badge = UIStyle.make_label(Localization.t("common.owned") if owned else fmt_credits(int(car["price"])),
		"numeric", 18, UIStyle.LIME if owned else UIStyle.GOLD)
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	h.add_child(badge)
	return b


func _build_side_panel() -> void:
	var panel = UIStyle.make_glass_panel(28, Color(0.04, 0.06, 0.11, 0.86), 24, 0.2)
	panel.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	panel.offset_left = -716
	panel.offset_right = -44
	panel.offset_top = 160
	panel.offset_bottom = -40
	content.add_child(panel)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	panel.add_child(v)
	_name_label = UIStyle.make_title("—", 46, UIStyle.CYAN)
	v.add_child(_name_label)
	_price_label = UIStyle.make_label("", "numeric", 22, UIStyle.GOLD)
	v.add_child(_price_label)
	_tab_row = HBoxContainer.new()
	_tab_row.add_theme_constant_override("separation", 8)
	v.add_child(_tab_row)
	for tab in ["tune", "paint", "rims"]:
		var b = UIStyle.make_button(Localization.t("garage." + tab), UIStyle.VIOLET, tab == _tab, 18, 52)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var t = tab
		b.pressed.connect(func(): _set_tab(t))
		_tab_row.add_child(b)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var inner = VBoxContainer.new()
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.add_theme_constant_override("separation", 12)
	scroll.add_child(inner)
	_stats_box = VBoxContainer.new()
	_stats_box.add_theme_constant_override("separation", 8)
	inner.add_child(_stats_box)
	_paint_box = VBoxContainer.new()
	_paint_box.add_theme_constant_override("separation", 8)
	inner.add_child(_paint_box)
	_rim_box = VBoxContainer.new()
	_rim_box.add_theme_constant_override("separation", 8)
	inner.add_child(_rim_box)
	_upgrade_box = VBoxContainer.new()
	_upgrade_box.add_theme_constant_override("separation", 8)
	inner.add_child(_upgrade_box)
	_action_btn = UIStyle.make_button(Localization.t("common.equip"), UIStyle.CYAN, true, 26, 78)
	_action_btn.pressed.connect(_on_action)
	v.add_child(_action_btn)


func _set_tab(tab: String) -> void:
	_tab = tab
	for i in range(_tab_row.get_child_count()):
		var b: Button = _tab_row.get_child(i)
		var t = ["tune", "paint", "rims"][i]
		b.add_theme_stylebox_override("normal", UIStyle.glass_box(16, Color(0.08, 0.11, 0.19, 0.7), 0.15))
		if t == tab:
			b.add_theme_stylebox_override("normal", UIStyle.accent_box(UIStyle.VIOLET, 0.32, 16, 0.3))
	_refresh_panel()


func _selected_car() -> Dictionary:
	var car = GameData.car_by_id(_view_id)
	if car.is_empty():
		car = Game.selected_car()
	if car.is_empty():
		car = GameData.CARS[0]
	return car


func _select_car(id: String, _idx: int = 0) -> void:
	var car = GameData.car_by_id(id)
	if car.is_empty():
		return
	_view_id = id
	_name_label.text = str(car["name"])
	var owned = Game.owns(id)
	_price_label.text = "" if owned else fmt_credits(int(car["price"]))
	_spawn_model(car)
	_refresh_list()
	_refresh_panel()


func _spawn_model(car: Dictionary) -> void:
	if _car_model and is_instance_valid(_car_model):
		_car_model.queue_free()
		_car_model = null
	# The pivot only exists once the 3D viewport has been built, and it does NOT
	# exist if this screen was torn down between build() and this call — which is
	# exactly what happens when the test harness switches screens while the
	# garage is still constructing. A null parent here used to abort the rest of
	# the screen setup and leave a half-built UI.
	if _car_pivot == null or not is_instance_valid(_car_pivot):
		return
	var rec: Dictionary = Game.car_record(str(car["id"]))
	var model = CarModelScript.new()
	var paint_id = str(rec.get("paint", car.get("paint", "cyan")))
	model.build(car, paint_id, str(rec.get("rim", "stock")))
	model.position = Vector3(0, 0, 0)
	_car_pivot.add_child(model)
	_car_model = model


func _refresh_panel() -> void:
	for box in [_stats_box, _paint_box, _rim_box, _upgrade_box]:
		for c in box.get_children():
			c.queue_free()
	var car = _selected_car()
	var owned = Game.owns(str(car["id"]))
	var stats: Dictionary = Game.tuned_stats(str(car["id"]))
	_stats_box.add_child(UIStyle.make_kicker(Localization.t("common.stats"), UIStyle.CYAN, 14))
	var labels = [["speed", Localization.t("garage.speed")], ["accel", Localization.t("garage.accel")],
		["handling", Localization.t("garage.handling")], ["brake", Localization.t("garage.brake")],
		["nitro", Localization.t("garage.nitro")]]
	var colors = [UIStyle.CYAN, UIStyle.MAGENTA, UIStyle.LIME, UIStyle.AMBER, UIStyle.VIOLET]
	var i = 0
	for pair in labels:
		_stats_box.add_child(UIStyle.make_stat_bar(pair[1], float(stats[pair[0]]), colors[i], 10, 610))
		i += 1
	var equipped = owned and Game.selected_car_id() == str(car["id"])
	_action_btn.text = Localization.t("common.equipped") if equipped \
		else (Localization.t("common.equip") if owned else Localization.t("garage.buy_new"))
	_action_btn.disabled = equipped
	if _tab == "paint":
		_build_paints(car)
	elif _tab == "rims":
		_build_rims()
	else:
		_build_upgrades(car)


func _build_paints(car: Dictionary) -> void:
	_paint_box.add_theme_constant_override("separation", 12)
	var grid = GridContainer.new()
	grid.columns = 6
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	_paint_box.add_child(grid)
	var rec: Dictionary = Game.car_record(str(car["id"]))
	var current = str(rec.get("paint", car.get("paint", "cyan")))
	for p in GameData.PAINTS:
		var owned = Game.owns_paint(str(p["id"]))
		var sw = Button.new()
		sw.custom_minimum_size = Vector2(88, 64)
		sw.focus_mode = Control.FOCUS_NONE
		var col = Color(str(p["color"]))
		sw.add_theme_stylebox_override("normal", UIStyle.accent_box(col, 0.55, 14, 0.0))
		sw.add_theme_stylebox_override("hover", UIStyle.accent_box(col, 0.9, 14, 0.4))
		if str(p["id"]) == current:
			sw.add_theme_stylebox_override("normal", UIStyle.accent_box(col, 0.95, 14, 0.55))
		var pid = str(p["id"])
		sw.pressed.connect(func(): _pick_paint(pid))
		grid.add_child(sw)
		var lbl = UIStyle.make_label("" if owned else fmt_credits(int(p["price"])), "numeric", 12,
			UIStyle.GOLD if not owned else UIStyle.TEXT_DIM)
		lbl.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
		lbl.offset_top = -20
		lbl.offset_bottom = -2
		lbl.offset_left = -40
		lbl.offset_right = 40
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		sw.add_child(lbl)


func _pick_paint(pid: String) -> void:
	var car = _selected_car()
	var id = str(car["id"])
	if not Game.owns_paint(pid):
		if not Game.buy_paint(pid):
			AudioDirector.play_sfx("ui_back", -4.0)
			return
	Game.set_paint(id, pid)
	AudioDirector.play_sfx("ui_confirm", -2.0)
	_spawn_model(car)
	_refresh_panel()


func _build_rims() -> void:
	var grid = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	_rim_box.add_child(grid)
	var car = _selected_car()
	var rec: Dictionary = Game.car_record(str(car["id"]))
	var current = str(rec.get("rim", "stock"))
	for r in GameData.RIMS:
		var owned = Game.owns_rim(str(r["id"]))
		var b = UIStyle.make_button(str(r["name"]), UIStyle.CYAN, str(r["id"]) == current, 18, 64)
		if not owned:
			b.text = "%s  ·  %s" % [str(r["name"]), fmt_credits(int(r["price"]))]
		b.custom_minimum_size = Vector2(280, 64)
		var rid = str(r["id"])
		b.pressed.connect(func(): _pick_rim(rid))
		grid.add_child(b)


func _pick_rim(rid: String) -> void:
	var car = _selected_car()
	var id = str(car["id"])
	if not Game.owns_rim(rid):
		if not Game.buy_rim(rid):
			AudioDirector.play_sfx("ui_back", -4.0)
			return
	Game.set_rim(id, rid)
	AudioDirector.play_sfx("ui_confirm", -2.0)
	_spawn_model(car)
	_refresh_panel()


func _build_upgrades(car: Dictionary) -> void:
	var id = str(car["id"])
	if not Game.owns(id):
		_upgrade_box.add_child(UIStyle.make_label(Localization.trf("toast.locked_level", [1]),
			"body", 20, UIStyle.TEXT_DIM))
		return
	for kind in ["engine", "tires", "turbo"]:
		var info: Dictionary = GameData.UPGRADES[kind]
		var level = Game.upgrade_level(id, kind)
		var maxed = level >= int(info["max"])
		var cost = Game.upgrade_cost(id, kind)
		var row = UIStyle.make_glass_panel(18, Color(0.05, 0.08, 0.14, 0.6), 16)
		var h = HBoxContainer.new()
		h.add_theme_constant_override("separation", 14)
		row.add_child(h)
		var icon_rect = TextureRect.new()
		icon_rect.texture = UIStyle.icon(kind if kind != "tires" else "wheel")
		icon_rect.custom_minimum_size = Vector2(46, 46)
		icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon_rect.modulate = UIStyle.CYAN
		h.add_child(icon_rect)
		var col = VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_theme_constant_override("separation", -4)
		h.add_child(col)
		col.add_child(UIStyle.make_label(str(info["name"]), "bold", 24, Color.WHITE))
		col.add_child(UIStyle.make_progress_bar(float(level) / float(info["max"]) * 100.0, UIStyle.CYAN, 8))
		col.add_child(UIStyle.make_label("LV %d / %d" % [level, int(info["max"])], "kicker", 13, UIStyle.TEXT_DIM))
		var buy = UIStyle.make_button(Localization.t("common.max") if maxed else fmt_credits(cost),
			UIStyle.LIME, false, 20, 60)
		buy.custom_minimum_size = Vector2(210, 60)
		buy.disabled = maxed
		var k = kind
		buy.pressed.connect(func(): _buy_upgrade(k))
		h.add_child(buy)
		_upgrade_box.add_child(row)


func _buy_upgrade(kind: String) -> void:
	var id = _view_id
	if Game.buy_upgrade(id, kind):
		AudioDirector.play_sfx("purchase", -2.0)
		_refresh_panel()
		_refresh_list()
	else:
		AudioDirector.play_sfx("ui_back", -4.0)


func _on_action() -> void:
	var car = _selected_car()
	var id = str(car["id"])
	if Game.owns(id):
		Game.select_car(id)
		AudioDirector.play_sfx("ui_confirm", -2.0)
		_refresh_list()
		_refresh_panel()
		return
	if Game.buy_car(id):
		AudioDirector.play_sfx("purchase", 0.0)
		Game.select_car(id)
		AudioDirector.play_sfx("level_up", -4.0)
		_refresh_list()
		_refresh_panel()
	else:
		AudioDirector.play_sfx("ui_back", -4.0)
