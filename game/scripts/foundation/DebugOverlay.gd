class_name DebugOverlay
extends CanvasLayer
## F3-toggled dev overlay: frame time, draw calls, primitives, memory and
## optional provider data. Hidden in release builds unless explicitly enabled.

var enabled: bool = false
var label: Label
var provider: Node = null
var _timer: float = 0.0
var _frame_ms: float = 0.0
var _last_usec: int = 0

func setup(p_provider: Node = null) -> void:
	provider = p_provider
	label = Label.new()
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", Color(0.35, 1.0, 0.8))
	label.position = Vector2(12, 12)
	add_child(label)
	visible = false
	enabled = OS.is_debug_build() or "--debug-overlay" in OS.get_cmdline_args()

func toggle() -> void:
	enabled = not enabled
	visible = enabled

func _process(delta: float) -> void:
	var now := Time.get_ticks_usec()
	if _last_usec > 0:
		_frame_ms = float(now - _last_usec) / 1000.0
	_last_usec = now
	if not enabled or label == null:
		return
	_timer += delta
	if _timer < 0.25:
		return
	_timer = 0.0
	var lines := [
		"NOVA MIRA • DEV OVERLAY",
		"frame: %.2f ms   fps: %.0f" % [_frame_ms, 1000.0 / maxf(_frame_ms, 0.01)],
		"process: %.2f ms" % Performance.get_monitor(Performance.TIME_PROCESS),
		"draw calls: %d   primitives: %d" % [
			int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
			int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))],
		"static mem: %.1f MB   objects: %d" % [
			float(Performance.get_monitor(Performance.MEMORY_STATIC)) / 1048576.0,
			int(Performance.get_monitor(Performance.OBJECT_COUNT))],
	]
	if provider != null and provider.has_method("get_debug_data"):
		var extra: Dictionary = provider.call("get_debug_data")
		for k in extra.keys():
			lines.append("%s: %s" % [String(k), String(extra[k])])
	label.text = "\n".join(lines)
