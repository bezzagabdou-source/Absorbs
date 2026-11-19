extends CharacterBody3D
## Arcade-simulation vehicle. A proper vehicle-dynamics model (longitudinal /
## lateral tyre slip, weight transfer, downforce, nitro, damage) driven through
## CharacterBody3D so the car is frame-rate independent and never tunnels.
##
## Local axes: -Z is forward (Godot convention), +X is right.

signal gear_changed(gear: int)
signal impact(strength: float)
signal nitro_started
signal nitro_ended

# --- tuning (filled from GameData.physics_for) -----------------------------
var top_speed := 80.0            # m/s
var engine_accel := 11.0         # m/s^2 at rest
var grip := 0.9                  # 0..1 lateral grip factor
var brake_decel := 18.0
var nitro_power := 0.4
var steer_rate := 1.7
var mass := 1350.0

# --- state -----------------------------------------------------------------
var speed := 0.0                 # signed forward speed m/s
var steer := 0.0                 # smoothed -1..1
var throttle := 0.0
var brake_input := 0.0
var handbrake := false
var nitro_active := false
var nitro_amount := 1.0          # 0..1 tank
var gear := 1
var rpm := 900.0
var drift_amount := 0.0          # 0..1 visual/score
var damage := 0.0                # 0..1
var wheel_spin := 0.0
var airborne := false
var distance_travelled := 0.0
var nitro_used_time := 0.0
var drift_time := 0.0
var wall_hits := 0
var laps_completed := 0
var last_safe_position := Vector3.ZERO
var input_enabled := true
var autopilot := false

var _yaw_rate := 0.0
var _is_player := false
var _nitro_hold := false
var _impact_cooldown := 0.0
var _prev_velocity := Vector3.ZERO
var _assist := true
var _body: Node3D = null

const GEAR_RATIOS := [3.6, 2.5, 1.9, 1.5, 1.2, 1.0]
const FINAL_DRIVE := 3.4
const WHEEL_RADIUS := 0.35
const DRAG := 0.00042


func apply_physics(p: Dictionary, is_player: bool = false) -> void:
	top_speed = float(p.get("top_speed_ms", 80.0))
	engine_accel = float(p.get("accel", 11.0))
	grip = float(p.get("grip", 0.9))
	brake_decel = float(p.get("brake", 18.0))
	nitro_power = float(p.get("nitro", 0.4))
	steer_rate = float(p.get("steer", 1.7))
	mass = float(p.get("mass", 1350.0))
	_is_player = is_player


func attach_model(model: Node3D) -> void:
	if _body != null and is_instance_valid(_body):
		_body.queue_free()
	_body = model
	add_child(model)


func model() -> Node3D:
	return _body


func _ready() -> void:
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = 0.6
	up_direction = Vector3.UP
	last_safe_position = global_position
	_assist = bool(SettingsStore.get_value("assist", true))


func _physics_process(delta: float) -> void:
	if input_enabled:
		_read_input(delta)
	else:
		throttle = 0.0
		brake_input = 0.0
		nitro_active = false
	_update_gearbox(delta)
	_longitudinal(delta)
	_lateral(delta)
	_apply_motion(delta)
	_post(delta)


func set_inputs(throttle_v: float, brake_v: float, steer_v: float, nitro: bool,
		handbrake_v: bool = false) -> void:
	throttle = clampf(throttle_v, 0.0, 1.0)
	brake_input = clampf(brake_v, 0.0, 1.0)
	if _is_player:
		steer = move_toward(steer, clampf(steer_v, -1.0, 1.0), delta_steer() * get_physics_process_delta_time() * 5.0)
	else:
		steer = move_toward(steer, clampf(steer_v, -1.0, 1.0), 0.18)
	_nitro_hold = nitro
	handbrake = handbrake_v
	_apply_nitro(nitro)


func delta_steer() -> float:
	return float(SettingsStore.get_value("sensitivity", 1.0))


func _read_input(delta: float) -> void:
	throttle = Input.get_action_strength("throttle")
	brake_input = Input.get_action_strength("brake")
	handbrake = Input.is_action_pressed("handbrake")
	_nitro_hold = Input.is_action_pressed("nitro")
	var target := Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left")
	var rate := 9.0 * float(SettingsStore.get_value("sensitivity", 1.0))
	steer = move_toward(steer, target, rate * delta)
	_apply_nitro(_nitro_hold)


func _apply_nitro(hold: bool) -> void:
	var want := hold and nitro_amount > 0.001 and throttle > 0.2
	if want and not nitro_active:
		nitro_active = true
		nitro_started.emit()
	elif not want and nitro_active:
		nitro_active = false
		nitro_ended.emit()


func _update_gearbox(delta: float) -> void:
	var kmh := absf(speed) * 3.6
	var ratio: float = float(GEAR_RATIOS[clampi(gear - 1, 0, GEAR_RATIOS.size() - 1)])
	var max_for_gear = top_speed * 3.6 / GEAR_RATIOS.size() * gear + 18.0
	if kmh > max_for_gear and gear < GEAR_RATIOS.size():
		gear += 1
		gear_changed.emit(gear)
	elif gear > 1 and kmh < max_for_gear - 26.0:
		gear -= 1
		gear_changed.emit(gear)
	var target_rpm = clampf(kmh / maxf(1.0, top_speed * 3.6) * 7800.0 * (1.0 + (ratio - 1.0) * 0.12), 900.0, 8200.0)
	if throttle < 0.05 and speed < 2.0:
		target_rpm = 900.0
	rpm = lerpf(rpm, target_rpm, clampf(delta * 6.0, 0.0, 1.0))


func _longitudinal(delta: float) -> void:
	var accel := 0.0
	var kmh := absf(speed) * 3.6
	if throttle > 0.0:
		var power_band := clampf(1.0 - pow(kmh / maxf(1.0, top_speed * 3.6), 1.7), 0.0, 1.0)
		accel = engine_accel * throttle * (0.35 + 0.65 * power_band)
		if nitro_active and nitro_amount > 0.0:
			accel += engine_accel * nitro_power
			nitro_amount = maxf(0.0, nitro_amount - delta / 3.4)
			nitro_used_time += delta
			if nitro_amount <= 0.0:
				nitro_active = false
				nitro_ended.emit()
	if brake_input > 0.0:
		if speed > 0.5:
			accel -= brake_decel * brake_input
		elif throttle < 0.05:
			accel -= engine_accel * 0.35 * brake_input
	if handbrake:
		accel -= brake_decel * 0.55
	# aero drag + rolling resistance, calibrated so full throttle tops out at top_speed
	var v := absf(speed)
	var v_top := maxf(1.0, top_speed)
	var roll := 0.35
	var drag := maxf(0.0001, engine_accel * 0.35 - roll) / (v_top * v_top)
	accel -= drag * v * v * signf(speed)
	accel -= roll * signf(speed)
	speed += accel * delta
	speed = clampf(speed, -top_speed * 0.22, top_speed * (1.0 + nitro_power * 0.35))
	if absf(speed) < 0.4 and throttle < 0.05:
		speed = 0.0
	# nitro regen when not using it
	if not nitro_active:
		nitro_amount = minf(1.0, nitro_amount + delta * 0.055)


func _lateral(delta: float) -> void:
	var speed_norm := clampf(absf(speed) / maxf(1.0, top_speed), 0.0, 1.0)
	var steer_authority := steer_rate * (1.0 - speed_norm * 0.52)
	var turn = steer * steer_authority * (0.35 + speed_norm * 0.9)
	# Lateral grip: high grip resists sliding, handbrake/damage reduces it
	var grip_factor = grip * (1.0 - damage * 0.35) - (0.42 if handbrake else 0.0)
	grip_factor = clampf(grip_factor, 0.12, 1.0)
	var target_yaw := turn * clampf(absf(speed) / 14.0, 0.0, 1.0)
	if speed < 0.0:
		target_yaw = -target_yaw
	_yaw_rate = lerpf(_yaw_rate, target_yaw, clampf(delta * (3.2 + grip_factor * 5.0), 0.0, 1.0))
	rotation.y += _yaw_rate * delta
	# drifting: lateral velocity exceeds grip
	drift_amount = absf(_yaw_rate) * speed_norm * (1.0 - grip_factor) * 2.4
	drift_amount = clampf(drift_amount + (0.25 if handbrake and speed_norm > 0.2 else 0.0), 0.0, 1.0)
	if drift_amount > 0.35 and speed > 8.0:
		drift_time += delta
	# slight roll/pitch visual on the body node
	if _body != null:
		var roll_target = -steer * clampf(speed_norm * 1.4 + drift_amount * 0.5, 0.0, 1.0) * 0.06
		var pitch_target = clampf((throttle - brake_input) * 0.03 + (0.02 if nitro_active else 0.0), -0.05, 0.05)
		_body.rotation.z = lerpf(_body.rotation.z, roll_target, delta * 6.0)
		_body.rotation.x = lerpf(_body.rotation.x, -pitch_target, delta * 5.0)


func _apply_motion(_delta: float) -> void:
	var forward := -global_transform.basis.z
	var motion := forward * speed
	# lateral slip vector for drift look
	var side := global_transform.basis.x
	motion += side * drift_amount * speed * 0.16 * signf(steer)
	velocity = motion
	_prev_velocity = velocity
	airborne = not is_on_floor() and global_position.y > 1.0
	move_and_slide()
	var hit := false
	var strength := 0.0
	for i in range(get_slide_collision_count()):
		var col := get_slide_collision(i)
		var n := col.get_normal()
		if absf(n.y) > 0.55:
			continue
		var other := col.get_collider()
		if other is StaticBody3D or other is CSGShape3D:
			hit = true
			strength = maxf(strength, absf(speed) * 0.35)
			break
	if hit and _impact_cooldown <= 0.0:
		_impact_cooldown = 0.45
		wall_hits += 1
		damage = clampf(damage + strength / top_speed * 0.55, 0.0, 1.0)
		speed *= 0.62
		impact.emit(strength)
	if is_on_floor():
		last_safe_position = global_position


func _post(delta: float) -> void:
	_impact_cooldown = maxf(0.0, _impact_cooldown - delta)
	distance_travelled += absf(speed) * delta
	wheel_spin += speed * delta / WHEEL_RADIUS
	if _body != null and _body.has_method("steer_wheels"):
		var steer_vis := steer * 0.42
		_body.steer_wheels(steer_vis, wheel_spin)
		if _body.has_method("set_nitro"):
			_body.set_nitro(nitro_active, nitro_amount)
		if _body.has_method("set_brake"):
			_body.set_brake(brake_input > 0.1 or handbrake)


func speed_kmh() -> float:
	return absf(speed) * 3.6


func linear_speed() -> float:
	return absf(speed)


func grip_limit() -> float:
	return grip


func rpm_ratio() -> float:
	return clampf(rpm / 8200.0, 0.0, 1.0)


func reset_car(pos: Vector3, yaw: float) -> void:
	global_position = pos
	rotation.y = yaw
	speed = 0.0
	_prev_velocity = Vector3.ZERO
	_yaw_rate = 0.0
	steer = 0.0
	velocity = Vector3.ZERO


func repair() -> void:
	damage = 0.0
	nitro_amount = 1.0
	if _body != null and _body.has_method("set_damage"):
		_body.set_damage(0.0)
