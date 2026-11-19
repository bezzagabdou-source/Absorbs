extends Control
## Application root. Sets up the SceneRouter host, applies all persisted
## settings, wires platform bits (immersive mode, 120 Hz target) and opens the
## boot screen. Also exposes a `--screen=<id>` CLI switch used by CI to boot
## every screen headlessly and by the screenshot rig.

const SCREENS := ["boot", "menu", "tracks", "race", "garage", "shop", "results",
	"achievements", "daily", "settings", "credits", "profile"]

var _fps_accum := 0.0
var _fps_frames := 0


func _ready() -> void:
	SettingsStore.apply_all()
	Localization.set_language(str(SettingsStore.get_value("language", "en")))
	_apply_window()
	SceneRouter.setup(self)
	var forced := _forced_screen()
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
	var target := int(DisplayServer.screen_get_refresh_rate())
	Engine.max_fps = 0 if target <= 0 else maxi(60, target)


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
			var fps := float(_fps_frames) / _fps_accum
			_fps_accum = 0.0
			_fps_frames = 0
			var lbl := get_node_or_null("FpsLabel") as Label
			if lbl == null:
				lbl = UIStyle.make_label("", "numeric", 20, UIStyle.LIME)
				lbl.name = "FpsLabel"
				lbl.set_anchors_preset(Control.PRESET_TOP_RIGHT)
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
