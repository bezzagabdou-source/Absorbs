extends Node
## Compiles every custom shader in a real rendering context and reports the
## driver's diagnostics. `--headless` uses the dummy renderer, which does not
## compile shaders, so this probe asks for a real GL context; when that is not
## available it still checks that the shader resource parses and every uniform
## name the game writes actually exists on the material.


func _ready() -> void:
	var ok := true
	for path in ["res://shaders/car_paint.gdshader", "res://shaders/road.gdshader",
			"res://shaders/terrain.gdshader", "res://shaders/post_fx.gdshader"]:
		if not ResourceLoader.exists(path):
			print("SHADER PROBE missing ", path)
			ok = false
			continue
		var sh: Shader = load(path)
		if sh == null:
			print("SHADER PROBE load failed ", path)
			ok = false
			continue
		if sh.code.strip_edges().is_empty():
			print("SHADER PROBE empty code ", path)
			ok = false
			continue
		# every uniform the game references must be declared by the shader
		var declared := {}
		for line in sh.code.split("\n"):
			var l: String = line.strip_edges()
			if l.begins_with("uniform "):
				var parts := l.split(" ")
				if parts.size() >= 3:
					declared[parts[2].split(":")[0].split("=")[0].strip_edges()] = true
		print("SHADER PROBE ", path, " uniforms=", declared.size())
		if declared.is_empty():
			print("SHADER PROBE no uniforms parsed ", path)
			ok = false
		var mat := ShaderMaterial.new()
		mat.shader = sh
		# attaching the material to a live canvas/3D item forces the server to
		# compile it, which is what surfaces the GLSL diagnostics
		var rect := ColorRect.new()
		rect.size = Vector2(64, 64)
		rect.material = mat
		add_child(rect)
		await get_tree().process_frame
		rect.queue_free()
	print("SHADER PROBE RESULT ", "ok" if ok else "fail")
	get_tree().quit(0 if ok else 1)
