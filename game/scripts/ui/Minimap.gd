class_name Minimap
extends Control
## Circular rotating minimap drawn with the CanvasItem API (no textures needed).

var player: PlayerController
var police: PoliceAI
var missions: MissionRunner
var radius: float = 88.0

func setup(p_player: PlayerController, p_police: PoliceAI, p_missions: MissionRunner) -> void:
	player = p_player
	police = p_police
	missions = p_missions
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var c := size * 0.5
	draw_circle(c, radius, Color(0.03, 0.06, 0.10, 0.78))
	draw_arc(c, radius, 0, TAU, 48, Color(0.35, 0.85, 0.80, 0.9), 2.0)
	# roads in local frame (5 block spacing)
	var step := 8.0
	var offset := Vector2.ZERO
	if player != null:
		offset = Vector2(player.global_position.x, player.global_position.z) * 0.35
	for i in range(-12, 13):
		var x := c.x + float(i) * step - fmod(offset.x, step)
		draw_line(Vector2(x, c.y - radius), Vector2(x, c.y + radius), Color(0.45, 0.48, 0.52, 0.35), 1.0)
		var y := c.y + float(i) * step - fmod(offset.y, step)
		draw_line(Vector2(c.x - radius, y), Vector2(c.x + radius, y), Color(0.45, 0.48, 0.52, 0.35), 1.0)
	if missions != null and missions.active:
		var d := (missions.marker - player.global_position) * 0.35
		var p := c + Vector2(d.x, d.z).clamped(radius - 8)
		draw_circle(p, 5, Color(0.2, 1.0, 0.6))
	if police != null:
		for u in police._units:
			if not is_instance_valid(u):
				continue
			var d := ((u as Node3D).global_position - player.global_position) * 0.35
			var p := c + Vector2(d.x, d.z).clamped(radius - 6)
			draw_circle(p, 3, Color(1.0, 0.3, 0.25))
	draw_circle(c, 4, Color(1, 1, 1))
	if player != null:
		var a := player.rotation.y
		draw_line(c, c + Vector2(sin(a), -cos(a)) * 12, Color(1, 0.9, 0.4), 2)
