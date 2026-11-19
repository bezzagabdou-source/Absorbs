class_name WeaponSystem
extends Node
## 8 original weapons: hitscan + one projectile, recoil, spread, aim assist, decals.

var player: PlayerController
var camera_rig: CameraRig
var input: RefCounted
var bus: EventBus
var current: int = 2
var ammo: Dictionary = {"pistol": 36, "smg": 90, "rifle": 60, "shotgun": 24, "sniper": 10, "grenade": 8}
var owned: Array[int] = [0, 1, 2, 3, 4, 5, 6, 7]
var aim_assist: bool = true
var muted: bool = false
var _cooldown: float = 0.0
var _reloading: float = 0.0
var _flash: OmniLight3D
var _decals: Array[MeshInstance3D] = []
var _projectiles: Array = []
var _rng := RandomNumberGenerator.new()

func setup(p_player: PlayerController, p_rig: CameraRig, p_input: RefCounted, p_bus: EventBus) -> void:
	player = p_player
	camera_rig = p_rig
	input = p_input
	bus = p_bus
	_rng.seed = 77123
	_flash = OmniLight3D.new()
	_flash.light_color = Color(1.0, 0.78, 0.4)
	_flash.light_energy = 0.0
	_flash.omni_range = 7.0
	add_child(_flash)
	_emit_state()

func _process(delta: float) -> void:
	_cooldown = maxf(0.0, _cooldown - delta)
	_reloading = maxf(0.0, _reloading - delta)
	_flash.light_energy = maxf(0.0, _flash.light_energy - delta * 40.0)
	if player == null or player.in_vehicle:
		return
	camera_rig.aiming = input.pressed("aim")
	if input.pressed("attack") and _cooldown <= 0.0 and _reloading <= 0.0:
		fire()
	if input.consume_tap("weapon_next"):
		next_weapon()
	if input.consume_tap("reload"):
		reload()

func can_fire() -> bool:
	var w := GameData.weapon(current)
	var key := String(w["key"])
	if int(w["ammo"]) < 0:
		return true
	return int(ammo.get(key, 0)) > 0

func fire() -> void:
	var w := GameData.weapon(current)
	var key := String(w["key"])
	if not can_fire():
		reload()
		return
	_cooldown = float(w["rate"])
	if int(w["ammo"]) > 0:
		ammo[key] = maxi(0, int(ammo[key]) - 1)
	if camera_rig == null:
		return
	var origin := camera_rig.aim_origin()
	var dir := camera_rig.aim_direction()
	var spread := float(w["spread"])
	dir += Vector3(_rng.randf_range(-spread, spread), _rng.randf_range(-spread, spread), 0)
	dir = dir.normalized()
	if aim_assist:
		dir = _assist(origin, dir, float(w["range"]))
	_flash.global_position = origin + dir * 1.2
	_flash.light_energy = 3.0
	if camera_rig != null:
		camera_rig.shake(0.06 if current < 4 else 0.16)
	_play_sound(key)
	if bool(w["projectile"]):
		_throw_grenade(origin + dir * 1.2, dir, float(w["damage"]))
	else:
		_hitscan(origin, dir, w)
	_emit_state()

func _assist(origin: Vector3, dir: Vector3, range: float) -> Vector3:
	var space := player.get_world_3d().direct_space_state
	var query := PhysicsShapeQueryParameters3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 12.0
	query.shape = sphere
	query.transform = Transform3D(Basis.IDENTITY, origin + dir * range * 0.5)
	query.collision_mask = 2
	var result := space.intersect_shape(query, 8)
	var best := dir
	var best_score := 0.93
	for hit in result:
		var target: Node3D = hit.collider as Node3D
		if target == null or target == player:
			continue
		var to := (target.global_position - origin).normalized()
		var score := to.dot(dir)
		if score > best_score:
			best_score = score
			best = to
	return best

func _hitscan(origin: Vector3, dir: Vector3, w: Dictionary) -> void:
	var space := player.get_world_3d().direct_space_state
	var end := origin + dir * float(w["range"])
	var query := PhysicsRayQueryParameters3D.create(origin, end)
	query.exclude = [player.get_rid()]
	query.collision_mask = 1 | 2
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return
	var point: Vector3 = hit["position"]
	var normal: Vector3 = hit.get("normal", Vector3.UP)
	_spawn_decal(point, normal)
	var target: Object = hit.get("collider")
	var part := "torso"
	if target is Node3D:
		var local := (point - (target as Node3D).global_position)
		if local.y > 1.5:
			part = "head"
		elif absf(local.x) > 0.35 and local.y < 1.0:
			part = "limb"
	if target != null and target is Node and (target as Node).has_method("take_damage"):
		target.call("take_damage", float(w["damage"]), part)

func _spawn_decal(pos: Vector3, normal: Vector3) -> void:
	if muted:
		return
	var decal := MeshInstance3D.new()
	var quad := PlaneMesh.new()
	quad.size = Vector2(0.16, 0.16)
	decal.mesh = quad
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.04, 0.04, 0.04)
	decal.material_override = mat
	decal.position = pos + normal * 0.02
	decal.look_at(pos + normal, Vector3.UP)
	get_tree().root.add_child(decal)
	_decals.append(decal)
	if _decals.size() > 40:
		var old := _decals.pop_front() as MeshInstance3D
		if is_instance_valid(old):
			old.queue_free()

func _throw_grenade(origin: Vector3, dir: Vector3, damage: float) -> void:
	var body := RigidBody3D.new()
	var mesh := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.14
	mesh.mesh = sphere
	body.add_child(mesh)
	body.global_position = origin
	body.mass = 0.6
	get_tree().root.add_child(body)
	body.apply_impulse(dir * 18.0)
	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = 1.6
	body.add_child(timer)
	timer.timeout.connect(_explode.bind(body, damage))
	timer.start()
	_projectiles.append(body)

func _explode(body: Node, damage: float) -> void:
	if not is_instance_valid(body):
		return
	var pos: Vector3 = body.global_position
	var sound := AudioStreamPlayer3D.new()
	var s := load("res://assets/audio/explosion.wav")
	if s != null:
		sound.stream = s
		get_tree().root.add_child(sound)
		sound.global_position = pos
		sound.play()
	var space := player.get_world_3d().direct_space_state
	var q := PhysicsShapeQueryParameters3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 9.0
	q.shape = sphere
	q.transform = Transform3D(Basis.IDENTITY, pos)
	q.collision_mask = 1 | 2
	for hit in space.intersect_shape(q, 24):
		var node := hit.collider as Node
		if node != null and node.has_method("take_damage"):
			var d := pos.distance_to((node as Node3D).global_position)
			node.call("take_damage", damage * clampf(1.0 - d / 10.0, 0.0, 1.0), "torso")
	body.queue_free()

func _play_sound(key: String) -> void:
	if muted:
		return
	var file := "res://assets/audio/shoot.wav"
	if key == "fist" or key == "bat":
		file = "res://assets/audio/hit.wav"
	var s := load(file)
	if s == null:
		return
	var p := AudioStreamPlayer.new()
	p.stream = s
	p.volume_db = -6.0
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func next_weapon() -> void:
	for i in range(1, GameData.WEAPONS.size() + 1):
		var idx := (current + i) % GameData.WEAPONS.size()
		if owned.has(idx):
			select(idx)
			return

func select(idx: int) -> void:
	if idx < 0 or idx >= GameData.WEAPONS.size():
		return
	current = idx
	_emit_state()

func reload() -> void:
	var w := GameData.weapon(current)
	var key := String(w["key"])
	if int(w["ammo"]) < 0:
		return
	_reloading = 0.9
	ammo[key] = int(w["ammo"])
	_emit_state()

func buy_weapon(idx: int) -> bool:
	if idx < 0 or idx >= GameData.WEAPONS.size():
		return false
	if owned.has(idx):
		return false
	var price := int(GameData.weapon(idx)["price"])
	if not player.spend(price):
		return false
	owned.append(idx)
	var key := String(GameData.weapon(idx)["key"])
	if int(GameData.weapon(idx)["ammo"]) > 0 and not ammo.has(key):
		ammo[key] = int(GameData.weapon(idx)["ammo"])
	select(idx)
	return true

func add_ammo(key: String, amount: int) -> void:
	ammo[key] = int(ammo.get(key, 0)) + amount
	_emit_state()

func _emit_state() -> void:
	if bus == null:
		return
	var w := GameData.weapon(current)
	var key := String(w["key"])
	bus.weapon_changed.emit(String(w["name"]), int(ammo.get(key, -1)), int(w["ammo"]))
