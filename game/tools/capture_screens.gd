extends SceneTree
## CI screenshot capture. Run with Godot + Xvfb + OpenGL:
##   xvfb-run -a godot --path game --rendering-method gl_compatible \
##     --rendering-driver opengl3 --script res://tools/capture_screens.gd
## Saves real rendered frames into $GITHUB_WORKSPACE/screenshots/.

var main: Node = null

func _initialize() -> void:
	var out_dir := OS.get_environment("GITHUB_WORKSPACE")
	if out_dir.is_empty():
		out_dir = ProjectSettings.globalize_path("res://..")
	out_dir = out_dir.path_join("screenshots")
	DirAccess.make_dir_recursive_absolute(out_dir)
	var scene: PackedScene = load("res://scenes/Main.tscn")
	if scene == null:
		printerr("[SHOT] Main scene missing")
		quit(1)
		return
	main = scene.instantiate()
	root.add_child.call_deferred(main)
	for i in range(30):
		await process_frame
	await create_timer(3.0).timeout
	await _save(out_dir, "01-main-menu.png")
	main.call("_on_start", true)
	await create_timer(2.0).timeout
	await _save(out_dir, "02-gameplay-day.png")
	main.day.hour = 22.0
	main.day.apply()
	main.weather.set_state(2)
	await create_timer(1.5).timeout
	await _save(out_dir, "03-gameplay-night-rain.png")
	main.ui.toggle_phone()
	await create_timer(0.7).timeout
	await _save(out_dir, "04-phone-ui.png")
	main.ui.toggle_phone()
	main.debug_overlay.toggle()
	await create_timer(0.7).timeout
	await _save(out_dir, "05-debug-overlay.png")
	print("[SHOT] all screenshots captured")
	quit(0)

func _save(dir: String, name: String) -> void:
	await RenderingServer.frame_post_draw
	var img: Image = root.get_texture().get_image()
	var path := dir.path_join(name)
	img.save_png(path)
	print("[SHOT] %s  %dx%d" % [path, img.get_width(), img.get_height()])
