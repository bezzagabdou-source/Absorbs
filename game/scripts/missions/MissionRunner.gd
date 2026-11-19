class_name MissionRunner
extends Node
## Five story jobs plus four repeatable activities. Objective-driven, not hard-coded cutscenes.

signal mission_started(title: String)
signal mission_finished(title: String, reward: int)

var bus: EventBus
var player: PlayerController
var police: PoliceAI
var graph: RoadGraph
var index: int = -1
var step: int = 0
var progress: int = 0
var active: bool = false
var title: String = ""
var objective: String = ""
var marker: Vector3 = Vector3.ZERO
var marker_node: MeshInstance3D
var completed: Array[int] = []
var _timer: float = 0.0
var _rng := RandomNumberGenerator.new()

const STORY := [
	{"title": "First Delivery", "steps": [{"t": "goto", "p": [300, 0, 300]}, {"t": "goto", "p": [-300, 0, -200]}], "reward": 1500, "stars": 0},
	{"title": "The Yard", "steps": [{"t": "kill", "n": 3, "p": [-700, 0, 400]}, {"t": "goto", "p": [-450, 0, 450]}], "reward": 3200, "stars": 1},
	{"title": "Hot Ride", "steps": [{"t": "vehicle", "id": "sport"}, {"t": "escape", "secs": 25}], "reward": 4800, "stars": 2},
	{"title": "Night Shift", "steps": [{"t": "goto", "p": [600, 0, -600]}, {"t": "survive", "secs": 35}], "reward": 6500, "stars": 3},
	{"title": "Harbour Deal", "steps": [{"t": "goto", "p": [-760, 0, 960]}, {"t": "escape", "secs": 30}], "reward": 9000, "stars": 4},
]
const SIDE := [
	{"title": "Street Race", "steps": [{"t": "goto", "p": [200, 0, 200]}, {"t": "goto", "p": [600, 0, 200]}, {"t": "goto", "p": [200, 0, -200]}], "reward": 900, "stars": 0},
	{"title": "Taxi Run", "steps": [{"t": "goto", "p": [-200, 0, 100]}, {"t": "goto", "p": [100, 0, -400]}], "reward": 700, "stars": 0},
	{"title": "Ambulance", "steps": [{"t": "goto", "p": [400, 0, 500]}, {"t": "goto", "p": [-100, 0, 700]}], "reward": 800, "stars": 0},
	{"title": "Bounty", "steps": [{"t": "kill", "n": 2, "p": [-500, 0, -500]}], "reward": 1200, "stars": 1},
]

func setup(p_bus: EventBus, p_player: PlayerController, p_police: PoliceAI, p_graph: RoadGraph) -> void:
	bus = p_bus
	player = p_player
	police = p_police
	graph = p_graph
	_rng.seed = 2026
	_marker_setup()

func _marker_setup() -> void:
	marker_node = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 1.8
	torus.outer_radius = 2.3
	marker_node.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.emission_enabled = true
	mat.emission = Color(0.2, 0.95, 0.85)
	mat.emission_energy_multiplier = 2.0
	marker_node.material_override = mat
	marker_node.visible = false
	get_tree().root.add_child(marker_node)

func mission_count() -> int:
	return STORY.size() + SIDE.size()

func mission_title(i: int) -> String:
	var m: Dictionary = STORY[i] if i < STORY.size() else SIDE[i - STORY.size()]
	return String(m["title"])

func start(i: int) -> bool:
	if i < 0 or i >= mission_count():
		return false
	index = i
	step = 0
	progress = 0
	_timer = 0.0
	active = true
	var m: Dictionary = STORY[i] if i < STORY.size() else SIDE[i - STORY.size()]
	title = String(m["title"])
	_set_objective()
	if int(m["stars"]) > 0:
		police.set_stars(maxi(police.stars, int(m["stars"])))
	mission_started.emit(title)
	if bus != null:
		bus.mission_changed.emit(title, objective)
		bus.toast.emit("Mission: %s" % title)
	return true

func next_story() -> int:
	for i in range(STORY.size()):
		if not completed.has(i):
			return i
	return -1

func _steps() -> Array:
	if index < STORY.size():
		return STORY[index]["steps"]
	return SIDE[index - STORY.size()]["steps"]

func _set_objective() -> void:
	if not active:
		marker_node.visible = false
		return
	var steps: Array = _steps()
	if step >= steps.size():
		_finish()
		return
	var s: Dictionary = steps[step]
	match String(s["t"]):
		"goto":
			var p: Array = s["p"]
			marker = Vector3(float(p[0]), 0, float(p[2]))
			marker_node.global_position = marker + Vector3(0, 3, 0)
			marker_node.visible = true
			objective = "Reach the marker"
		"kill":
			marker = Vector3(float(s["p"][0]), 0, float(s["p"][2]))
			marker_node.global_position = marker + Vector3(0, 3, 0)
			marker_node.visible = true
			objective = "Eliminate %d targets" % int(s["n"])
		"vehicle":
			objective = "Steal a %s" % String(s["id"])
			marker_node.visible = false
		"escape":
			objective = "Escape — %d s" % maxi(0, int(s["secs"]) - int(_timer))
			marker_node.visible = false
		"survive":
			objective = "Survive — %d s" % maxi(0, int(s["secs"]) - int(_timer))
			marker_node.visible = false
	if bus != null:
		bus.mission_changed.emit(title, objective)

func _physics_process(delta: float) -> void:
	if not active:
		return
	if marker_node != null and marker_node.visible:
		marker_node.rotation.y += delta * 1.5
	if police == null or player == null:
		return
	var steps: Array = _steps()
	if step >= steps.size():
		return
	var s: Dictionary = steps[step]
	var type := String(s["t"])
	if type == "escape":
		_timer += delta
		objective = "Escape — %d s" % maxi(0, int(s["secs"]) - int(_timer))
		if _timer >= float(s["secs"]) and police.stars == 0:
			_advance()
	elif type == "survive":
		_timer += delta
		objective = "Survive — %d s" % maxi(0, int(s["secs"]) - int(_timer))
		if _timer >= float(s["secs"]) and player.health > 0.0:
			_advance()
	elif type == "goto":
		if player.global_position.distance_to(marker) < 22.0:
			_advance()
	elif type == "vehicle":
		if player.current_vehicle != null and String(player.current_vehicle.get("spec")["id"]) == String(s["id"]):
			_advance()
	if bus != null:
		bus.mission_changed.emit(title, objective)

func _advance() -> void:
	step += 1
	_timer = 0.0
	_set_objective()

func _finish() -> void:
	active = false
	if marker_node != null:
		marker_node.visible = false
	var m: Dictionary = STORY[index] if index < STORY.size() else SIDE[index - STORY.size()]
	var reward := int(m["reward"])
	if not completed.has(index):
		completed.append(index)
	player.add_money(reward)
	mission_finished.emit(title, reward)
	if bus != null:
		bus.mission_completed.emit(title, reward)
		bus.toast.emit("Mission complete: %s  +%d" % [title, reward])
