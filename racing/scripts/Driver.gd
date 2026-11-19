extends Control
## Application root. Sets up the SceneRouter host, applies all persisted
## settings, wires platform bits (immersive mode, 120 Hz target) and opens the
## boot screen. Also exposes a `--screen=<id>` CLI switch used by CI to boot
## every screen headlessly and by the screenshot rig.

const SCREENS := ["boot", "menu", "tracks", "race", "garage", "shop", "results",
	"achievements", "daily", "settings", "credits", "profile"]

var _fps_accum = 0.0
var _fps_frames = 0


func _ready() -> void:
	SettingsStore.apply_all()
	Localization.set_language(str(SettingsStore.get_value("language", "en")))
	_apply_window()
	SceneRouter.setup(self)
	var forced = _forced_screen()
	if forced != "":
		SceneRouter.goto_instant(forced)
	else:
		SceneRouter.goto_instant("boot")


func _apply_window() -> void:
	if not OS.has_feature("mobile"):
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	DisplayServer.screen_set_orientation(DisplayServer.SCREEN_SENSOR_LANDSCAPE)
	Engine.set_physics_ticks_per_second(60)
	var target = int(DisplayServer.screen_get_refresh_rate())
	Engine.max_fps = 0 if target <= 0 else maxi(60, target)


var _diag_lines: Array[String] = []


func _dlog(t: String) -> void:
	_diag_lines.append(t)
	print(t)


func _diag() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame
	var win := get_window()
	_dlog("[DIAG] window=%s visible=%s content_scale=%s mode=%s aspect=%s" % [win.size,
		win.get_visible_rect(), win.content_scale_size, win.content_scale_mode, win.content_scale_aspect])
	_dlog("[DIAG] main_size=%s rect=%s" % [size, get_global_rect()])
	var scr: Control = SceneRouter.current
	if scr == null:
		_dlog("[DIAG] no current screen")
		_write_diag()
		return
	_dlog("[DIAG] screen=%s size=%s rect=%s" % [SceneRouter.current_id, scr.size, scr.get_global_rect()])
	for c in scr.get_children():
		var cr: Control = c as Control
		if cr:
			_dlog("[DIAG] child=%s %s rect=%s anchors=%.2f,%.2f,%.2f,%.2f offsets=%.1f,%.1f,%.1f,%.1f" % [
				cr.name, cr.get_class(), cr.get_global_rect(), cr.anchor_left, cr.anchor_top,
				cr.anchor_right, cr.anchor_bottom, cr.offset_left, cr.offset_top, cr.offset_right,
				cr.offset_bottom])
	var content: Control = scr.get_node_or_null("Content")
	if content:
		_dlog("[DIAG] content rect=%s" % content.get_global_rect())
		for c in content.get_children():
			var cr2: Control = c as Control
			if cr2:
				var extra := ""
				if cr2 is TextureRect:
					extra = " tex=%s" % ((cr2 as TextureRect).texture != null)
				_dlog("[DIAG] content_child=%s %s rect=%s anchors=%.2f,%.2f,%.2f,%.2f%s" % [
					cr2.name, cr2.get_class(), cr2.get_global_rect(), cr2.anchor_left,
					cr2.anchor_top, cr2.anchor_right, cr2.anchor_bottom, extra])
	_write_diag()


func _write_diag() -> void:
	var f := FileAccess.open("user://diag.log", FileAccess.WRITE)
	if f:
		f.store_string("\n".join(_diag_lines))
		f.close()


func _forced_screen() -> String:
	for arg in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if arg.begins_with("--screen="):
			return arg.split("=", true, 1)[1]
	return ""


func _process(delta: float) -> void:
	if bool(SettingsStore.get_value("show_fps", false)):
		_fps_accum += delta
		_fps_frames += 1
		if _fps_accum >= 0.5:
			var fps = float(_fps_frames) / _fps_accum
			_fps_accum = 0.0
			_fps_frames = 0
			var lbl = get_node_or_null("FpsLabel") as Label
			if lbl == null:
				lbl = UIStyle.make_label("", "numeric", 20, UIStyle.LIME)
				lbl.name = "FpsLabel"
				lbl.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
				lbl.offset_left = -170
				lbl.offset_top = 16
				lbl.offset_right = -24
				lbl.offset_bottom = 50
				lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
				add_child(lbl)
				move_child(lbl, get_child_count() - 1)
			lbl.text = "%d FPS" % int(fps)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if SceneRouter.current_id == "race":
			return
		if SceneRouter.history.size() > 0:
			SceneRouter.back()
