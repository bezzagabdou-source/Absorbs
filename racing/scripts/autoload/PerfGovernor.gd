extends Node
## Keeps the frame rate near the display's ceiling instead of quietly sinking.
##
## "120 fps" is only meaningful if the game holds it, so this measures real frame
## times and steps quality down a notch when the budget is missed, then back up
## when there is headroom again. The steps are the ones that actually cost time on
## a phone: terrain mesh density, shadow distance, volumetric/glow post work and
## the sky's cloud octaves.
##
## It never touches gameplay. Physics stays at a fixed 60 Hz tick, so handling is
## identical on a flagship and on a two-year-old midrange.

signal quality_step_changed(step: int, label: String)

const TARGET_MS := 1000.0 / 120.0
const RELAX_MS := 1000.0 / 72.0      # below this we have room to climb back
const SAMPLE_SECONDS := 4.0
const WARMUP_SECONDS := 3.0

## Ordered from best to cheapest. `mesh` maps onto OpenWorld's grid density and
## `shadow` onto the direction light's split distances.
const STEPS := [
	{"label": "ULTRA", "mesh": 192, "shadow": 180.0, "glow": true, "clouds": 5,
		"traffic": 1.0, "particles": 1.0, "lod": 1.35, "shadow_size": 4096},
	{"label": "HIGH", "mesh": 160, "shadow": 140.0, "glow": true, "clouds": 4,
		"traffic": 0.9, "particles": 0.8, "lod": 1.0, "shadow_size": 2048},
	{"label": "BALANCED", "mesh": 128, "shadow": 110.0, "glow": true, "clouds": 3,
		"traffic": 0.65, "particles": 0.6, "lod": 0.8, "shadow_size": 2048},
	{"label": "PERFORMANCE", "mesh": 96, "shadow": 80.0, "glow": false, "clouds": 3,
		"traffic": 0.4, "particles": 0.35, "lod": 0.6, "shadow_size": 1024},
]

var step: int = 1
var fps: float = 0.0
var _elapsed: float = 0.0
var _frames: int = 0

## Set false in headless/QA runs where the wall clock is decoupled from rendering.
var active: bool = true


func _ready() -> void:
	process_priority = 1024
	active = not OS.has_feature("server")
	if DisplayServer.get_name() == "headless":
		active = false
	_apply(step)


func _process(delta: float) -> void:
	if not active:
		return
	_elapsed += delta
	_frames += 1
	if _elapsed < 1.0:
		return
	fps = float(_frames) / _elapsed
	_elapsed = 0.0
	_frames = 0
	if Time.get_ticks_msec() / 1000.0 < WARMUP_SECONDS:
		return
	# Only act on sustained, clearly-missed budgets so a single loading hitch or a
	# notification sliding in does not visibly drop the whole world's detail.
	if _settled():
		_consider()


var _last_change_msec: int = 0


func _settled() -> bool:
	return Time.get_ticks_msec() - _last_change_msec > int(SAMPLE_SECONDS * 1000.0)


func _consider() -> void:
	var budget: float = 1000.0 / maxf(fps, 1.0)
	if budget > TARGET_MS * 1.25 and step < STEPS.size() - 1:
		step += 1
		_apply(step)
	elif budget < RELAX_MS and step > 0:
		step -= 1
		_apply(step)


func _apply(new_step: int) -> void:
	step = clampi(new_step, 0, STEPS.size() - 1)
	_last_change_msec = Time.get_ticks_msec()
	var cfg: Dictionary = STEPS[step]
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	for node in tree.get_nodes_in_group("perf_glow"):
		if node is CanvasLayer or node is CanvasItem:
			(node as CanvasItem).visible = bool(cfg["glow"])
	# Shadow resolution is the single biggest thermal cost on a phone, so it
	# tracks the quality step rather than sitting at 4096 forever.
	RenderingServer.directional_shadow_atlas_set_size(int(cfg["shadow_size"]), true)
	for node in tree.get_nodes_in_group("perf_lod_bias"):
		if node is Node3D:
			(node as Node3D).set("lod_bias", float(cfg["lod"]))
	for node in tree.get_nodes_in_group("perf_traffic"):
		if node.has_method("set_density_scale"):
			node.call("set_density_scale", float(cfg["traffic"]))
	for node in tree.get_nodes_in_group("perf_particles"):
		if node.has_method("set_particle_scale"):
			node.call("set_particle_scale", float(cfg["particles"]))
	quality_step_changed.emit(step, str(cfg["label"]))


func current() -> Dictionary:
	return STEPS[step]

func label() -> String:
	return str(STEPS[step]["label"])
