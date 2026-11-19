extends Node
## Screen stack with a shader-driven transition (wipe + flash + scale).
## Screens are plain scripts extending Control built by the router (no .tscn),
## so every screen is verifiable at runtime and CI can boot each one headlessly.

signal screen_changed(id: String)

var root: Control          # set by Driver
var current: Control = null
var current_id = ""
var _wipe: ColorRect
var _wipe_mat: ShaderMaterial
var _busy = false
var history: Array[String] = []

const WIPE_SHADER := """
shader_type canvas_item;
uniform float progress = 0.0;
uniform vec4 accent : source_color = vec4(0.13,0.91,1.0,1.0);
void fragment() {
	vec2 uv = UV;
	// diagonal wipe with soft edge + neon rim
	float diag = (uv.x * 0.65 + uv.y * 0.35);
	float edge = smoothstep(progress - 0.18, progress, diag);
	float rim = smoothstep(progress - 0.22, progress - 0.16, diag) * edge;
	vec3 col = vec3(0.01, 0.012, 0.025);
	col += accent.rgb * rim * 2.2;
	float alpha = 1.0 - edge;
	COLOR = vec4(col, alpha);
}
"""


func setup(host: Control) -> void:
	root = host
	_wipe = ColorRect.new()
	_wipe.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_wipe.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wipe_mat = ShaderMaterial.new()
	var sh = Shader.new()
	sh.code = WIPE_SHADER
	_wipe_mat.shader = sh
	_wipe.material = _wipe_mat
	_wipe.visible = false
	root.add_child(_wipe)


func goto(scene_id: String, params: Dictionary = {}, push_history: bool = true) -> void:
	if _busy:
		return
	_busy = true
	AudioDirector.play_sfx("ui_back", -12.0)
	if current != null:
		if push_history and current_id != "":
			history.append(current_id)
		await _transition_out()
		current.queue_free()
		current = null
	var script_path = "res://scripts/ui/screens/%s.gd" % scene_id
	if not ResourceLoader.exists(script_path):
		push_error("screen missing: " + script_path)
		_busy = false
		return
	var scr = load(script_path).new()
	scr.router = self
	scr.params = params
	scr.name = scene_id
	root.add_child(scr)
	root.move_child(_wipe, root.get_child_count() - 1)
	current = scr
	current_id = scene_id
	await _transition_in()
	_busy = false
	screen_changed.emit(scene_id)


func back() -> void:
	if history.is_empty():
		return
	var prev: String = history.pop_back()
	_is_back = true
	goto(prev, {}, false)
	_is_back = false


var _is_back = false


func replace(scene_id: String, params: Dictionary = {}) -> void:
	history.clear()
	goto(scene_id, params, false)


func _transition_out() -> void:
	_wipe.visible = true
	_wipe_mat.set_shader_parameter("progress", 0.0)
	var tw = create_tween()
	tw.tween_method(func(v: float): _wipe_mat.set_shader_parameter("progress", v), 0.0, 1.25, 0.24) \
		.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	await tw.finished


func _transition_in() -> void:
	_wipe.visible = true
	_wipe_mat.set_shader_parameter("progress", 1.25)
	var tw = create_tween()
	tw.tween_method(func(v: float): _wipe_mat.set_shader_parameter("progress", v), 1.25, 2.0, 0.32) \
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	await tw.finished
	_wipe.visible = false


## Instant switch (no wipe) used by the screenshot rig and tests.
func goto_instant(scene_id: String, params: Dictionary = {}) -> Control:
	if current != null:
		current.queue_free()
		current = null
	var script_path = "res://scripts/ui/screens/%s.gd" % scene_id
	var scr = load(script_path).new()
	scr.router = self
	scr.params = params
	root.add_child(scr)
	current = scr
	current_id = scene_id
	return scr
