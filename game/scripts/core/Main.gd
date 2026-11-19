extends Node3D
## Entry point. The full game is built at runtime so the APK contains no external assets.
func _ready() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 3, 8)
	add_child(camera)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45, 30, 0)
	add_child(light)
	var label := Label.new()
	label.text = "NOVA MIRA"
	label.position = Vector2(40, 40)
	add_child(label)
	print("[NovaMira] boot OK")
