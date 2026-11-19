extends SceneTree
## Font FX: pre-renders styled GLOW + SHADOW versions of every display string
## used by the UI, so text itself looks like premium neon artwork.
##
## Output: assets/fontfx/fontfx_<hash>.png plus assets/fontfx/index.txt
## Run with:  godot --headless --path . --script res://tools/font_kit.gd

const FX_DIR := "res://assets/fontfx"
const FONT_PATH := "res://assets/fonts/Orbitron-Variable.ttf"

var _font: FontFile
var _jobs: Dictionary = {}


func _init() -> void:
	_font = load(FONT_PATH)
	if _font == null:
		push_error("font missing: " + FONT_PATH)
		quit(1)
		return
	_collect_strings()
	_render_all()
	_write_index()
	quit(0)


func _collect_strings() -> void:
	# Autoload scripts are not loaded in --script mode; load the table directly.
	var loc = load("res://scripts/autoload/Localization.gd").new()
	var seen: Dictionary = {}
	for lang in loc.STRINGS.keys():
		for key in loc.STRINGS[lang].keys():
			add_job(str(loc.STRINGS[lang][key]))
	for extra in ["APEX VELOCITY", "OWN THE NIGHT", "0", "1", "2", "3", "4", "5", "6", "7", "8",
			"9", "GO!", "%d", "%02d", "%03d", "km/h", "KM/H", "+%d CR"]:
		add_job(extra)
	# brands + car names (used as neon titles in the dealership)
	var gd = load("res://scripts/autoload/GameData.gd").new()
	for car in gd.CARS:
		add_job(str(car["name"]))
	for track in gd.TRACKS:
		add_job(str(track["name"]))
	print("[fontfx] strings: ", _jobs.size())
	seen.clear()


func add_job(text: String) -> void:
	if text.strip_edges() == "":
		return
	var h := _hash_text(text)
	if _jobs.has(h):
		return
	_jobs[h] = text


func _hash_text(text: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(text.to_utf8_buffer())
	return ctx.finish().hex_encode().substr(0, 16)


func _render_all() -> void:
	DirAccess.make_dir_recursive_absolute(FX_DIR)
	var size_px := 96
	for h in _jobs.keys():
		var text: String = _jobs[h]
		var w: float = _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
		var pad := 90
		var tex_w := int(ceil(w)) + pad * 2
		var tex_h := int(size_px * 2.1) + pad
		var vp := SubViewport.new()
		vp.size = Vector2i(tex_w, tex_h)
		vp.transparent_bg = true
		vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		vp.disable_3d = true
		var label := Label.new()
		label.text = text
		label.label_settings = _make_settings(size_px)
		label.position = Vector2(pad, pad * 0.5)
		label.size = Vector2(tex_w, tex_h)
		vp.add_child(label)
		add_root(vp)
		for i in range(3):
			await process_frame
		var img := vp.get_texture().get_image()
		img.save_png("%s/fontfx_%s.png" % [FX_DIR, h])
		root.remove_child(vp)
		vp.free()
		await process_frame


func add_root(node: Node) -> void:
	root.add_child(node)


func _make_settings(size_px: int) -> LabelSettings:
	var ls := LabelSettings.new()
	ls.font = _font
	ls.font_size = size_px
	ls.font_color = Color(1, 1, 1, 1)
	ls.outline_size = int(size_px * 0.09)
	ls.outline_color = Color(0.06, 0.55, 0.75, 0.85)
	ls.shadow_size = int(size_px * 0.22)
	ls.shadow_color = Color(0.0, 0.85, 1.0, 0.55)
	ls.shadow_offset = Vector2(0, size_px * 0.05)
	return ls


func _write_index() -> void:
	var f := FileAccess.open(FX_DIR + "/index.txt", FileAccess.WRITE)
	if not f:
		return
	for h in _jobs.keys():
		f.store_line("%s\t%s" % [h, _jobs[h]])
	f.close()
