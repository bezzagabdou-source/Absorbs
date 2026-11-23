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
var top_speed = 80.0            # m/s
var engine_accel = 11.0         # m/s^2 at rest
var grip = 0.9                  # 0..1 lateral grip factor
var brake_decel = 18.0
var nitro_power = 0.4
var steer_rate = 1.7
var mass = 1350.0

# --- state -----------------------------------------------------------------
var speed = 0.0                 # signed forward speed m/s
var steer = 0.0                 # smoothed -1..1
var throttle = 0.0
var brake_input = 0.0
var handbrake = false
var nitro_active = false
var nitro_amount = 1.0          # 0..1 tank
var gear = 1
var rpm = 900.0
var drift_amount = 0.0          # 0..1 visual/score
var damage = 0.0                # 0..1
var wheel_spin = 0.0
var airborne = false
var distance_travelled = 0.0
var nitro_used_time = 0.0
var drift_time = 0.0
var wall_hits = 0
var laps_completed = 0
var last_safe_position = Vector3.ZERO
var input_enabled = true
## Set whenever an external driver (touch pedals, tilt, steering wheel, AI) calls
## set_inputs(). Keyboard polling is suppressed while this is recent, because
## _read_input() runs every physics tick and used to overwrite the touch values
## with zero — on a phone, which has no keyboard, the car therefore never moved.
var _last_external_input_msec: int = -100000
var autopilot = false

var _yaw_rate = 0.0
var _is_player = false
var _nitro_hold = false
var _impact_cooldown = 0.0
var _prev_velocity = Vector3.ZERO
var _assist = true
var _body: Node3D = null

## --- transmission -----------------------------------------------------------
## Automatic keeps the old behaviour, so nothing that shipped regresses.
## Manual adds a clutch-free H-pattern: shift_up/shift_down hold the next gear
## and the engine cuts torque for SHIFT_TIME while it engages.
var manual_gearbox: bool = false
var clutch: float = 1.0                 ## 0 = shifting, 1 = fully engaged
var _shift_timer: float = 0.0
var _pending_gear: int = 0
const SHIFT_TIME := 0.22
const GEAR_TOP_KMH := [62.0, 104.0, 148.0, 196.0, 248.0, 330.0]

## --- driver aids ------------------------------------------------------------
## ABS prevents lock-up by releasing brake pressure when a wheel is about to
## stop rotating; traction control trims throttle when the driven wheels spin.
## Both are switchable because on a drift run you want them off.
var abs_enabled: bool = true
var tcs_enabled: bool = true
var abs_active: bool = false
var tcs_active: bool = false

## --- surface ---------------------------------------------------------------
## Grip scales by what the tyre is on: tarmac 1.0, wet tarmac 0.72, dirt 0.55,
## grass 0.42. The race screen samples the surface and calls set_surface().
var surface_grip: float = 1.0
var surface_name: String = "tarmac"
var _slip: float = 0.0                   ## 0..1 true tyre slip, for smoke

## Lateral velocity in the car's own frame, m/s. This is what makes a slide real:
## the chassis points one way, the mass keeps travelling another, and the gap
## between them is the slip angle. Without it "drifting" is just a visual lean.
var lateral_speed: float = 0.0
var slip_angle: float = 0.0             ## radians between heading and travel
var _tcs_cut: float = 0.0

## 0..1 road wetness, pushed in by the weather system. Reduces lateral grip and
## lengthens braking so rain is felt, not just seen.
var wetness: float = 0.0

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
	manual_gearbox = str(SettingsStore.get_value("transmission", "auto")) == "manual"
	abs_enabled = bool(SettingsStore.get_value("abs", true))
	tcs_enabled = bool(SettingsStore.get_value("tcs", true))


func _physics_process(delta: float) -> void:
	# An external driver wins for 150 ms after its last set_inputs() call, so a
	# desktop build still works on the keyboard while a phone uses the pedals.
	# Three states, and the difference matters:
	#   * input_enabled and no recent set_inputs()  -> player on a keyboard
	#   * input_enabled and a recent set_inputs()   -> player on touch (the phone)
	#   * input_enabled == false                    -> this car is driven entirely
	#     from outside (police cars, and every test). Its inputs come from
	#     set_inputs() and must NOT be zeroed here; doing that made an
	#     externally-driven car permanently unable to accelerate.
	# The only thing that ever has to be forced off is the keyboard reader.
	var external_active: bool = Time.get_ticks_msec() - _last_external_input_msec < 150
	if input_enabled and not external_active:
		_read_input(delta)
	_update_gearbox(delta)
	_longitudinal(delta)
	_lateral(delta)
	_apply_motion(delta)
	_post(delta)


func set_inputs(throttle_v: float, brake_v: float, steer_v: float, nitro: bool,
		handbrake_v: bool = false) -> void:
	_last_external_input_msec = Time.get_ticks_msec()
	throttle = clampf(throttle_v, 0.0, 1.0)
	brake_input = clampf(brake_v, 0.0, 1.0)
	if _is_player:
		steer = move_toward(steer, clampf(steer_v, -1.0, 1.0), delta_steer() * get_physics_process_delta_time() * 5.0)
	else:
		steer = move_toward(steer, clampf(steer_v, -1.0, 1.0), 0.18)
	_nitro_hold = nitro
	handbrake = handbrake_v
	_apply_nitro(nitro)


## Request a gear change. In manual mode the box holds the gear until the
## clutch re-engages; in automatic mode this is a no-op (the box decides).
func shift_up() -> void:
	if not manual_gearbox or _shift_timer > 0.0:
		return
	if gear >= GEAR_RATIOS.size():
		return
	_pending_gear = gear + 1
	_shift_timer = SHIFT_TIME
	clutch = 0.0


func shift_down() -> void:
	if not manual_gearbox or _shift_timer > 0.0:
		return
	if gear <= 1:
		return
	_pending_gear = gear - 1
	_shift_timer = SHIFT_TIME
	clutch = 0.0


## True while the gearbox is between gears, so the HUD can flash the rev bar.
func is_shifting() -> bool:
	return _shift_timer > 0.0


func set_surface(name: String, grip_value: float) -> void:
	surface_name = name
	surface_grip = clampf(grip_value, 0.2, 1.15)


## 0..1 of how hard the tyres are sliding. Drives smoke, skid marks and the
## tyre-squeal audio, and is deliberately different from `drift_amount`
## (which is presentation-only and can be high at low speed).
func slip() -> float:
	return _slip


func delta_steer() -> float:
	return float(SettingsStore.get_value("sensitivity", 1.0))


func _read_input(delta: float) -> void:
	throttle = Input.get_action_strength("throttle")
	brake_input = Input.get_action_strength("brake")
	handbrake = Input.is_action_pressed("handbrake")
	_nitro_hold = Input.is_action_pressed("nitro")
	var target = Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left")
	var rate = 9.0 * float(SettingsStore.get_value("sensitivity", 1.0))
	steer = move_toward(steer, target, rate * delta)
	_apply_nitro(_nitro_hold)


func _apply_nitro(hold: bool) -> void:
	var want = hold and nitro_amount > 0.001 and throttle > 0.2
	if want and not nitro_active:
		nitro_active = true
		nitro_started.emit()
	elif not want and nitro_active:
		nitro_active = false
		nitro_ended.emit()


func _update_gearbox(delta: float) -> void:
	delta = maxf(delta, 0.0001)
	var kmh = absf(speed) * 3.6
	var ratios: int = GEAR_RATIOS.size()
	if manual_gearbox:
		# clutch engagement: torque is zero mid-shift, then ramps in
		if _shift_timer > 0.0:
			_shift_timer = maxf(0.0, _shift_timer - delta)
			clutch = 1.0 - (_shift_timer / SHIFT_TIME)
			if _shift_timer <= 0.0 and _pending_gear > 0:
				gear = clampi(_pending_gear, 1, ratios)
				_pending_gear = 0
				gear_changed.emit(gear)
		else:
			clutch = minf(1.0, clutch + delta * 9.0)
		# a manual box does not shift itself, but it will bog: below the stall
		# speed for the selected gear the car shudders instead of accelerating
		var gear_top: float = float(GEAR_TOP_KMH[clampi(gear - 1, 0, GEAR_TOP_KMH.size() - 1)])
		if kmh > gear_top * 1.02:
			speed *= 0.9995            # hitting the limiter, not a free rev
	else:
		clutch = 1.0
		var max_for_gear = top_speed * 3.6 / ratios * gear + 18.0
		if kmh > max_for_gear and gear < ratios:
			gear += 1
			gear_changed.emit(gear)
		elif gear > 1 and kmh < max_for_gear - 26.0:
			gear -= 1
			gear_changed.emit(gear)
	var ratio: float = float(GEAR_RATIOS[clampi(gear - 1, 0, ratios - 1)])
	# rpm is gear-relative: a manual box held in 2nd screams at 40 km/h
	var gear_top_ms: float = float(GEAR_TOP_KMH[clampi(gear - 1, 0, GEAR_TOP_KMH.size() - 1)]) / 3.6
	var rpm_from_gear: float = clampf(kmh / maxf(0.001, gear_top_ms * 3.6) * 8200.0, 800.0, 8600.0)
	var target_rpm: float = lerpf(rpm_from_gear, rpm_from_gear * (1.0 + (ratio - 1.0) * 0.06), 0.4)
	if throttle < 0.05 and speed < 2.0:
		target_rpm = 900.0
	if _shift_timer > 0.0:
		target_rpm *= 0.75            # revs drop while the clutch is in
	rpm = lerpf(rpm, target_rpm, clampf(delta * 7.0, 0.0, 1.0))


func _longitudinal(delta: float) -> void:
	var accel = 0.0
	var kmh = absf(speed) * 3.6
	var throttle_eff: float = throttle * clutch
	# --- traction control: a first-gear launch at full throttle has more torque
	# than the tyres can put down; TCS trims it rather than letting the car spin.
	tcs_active = false
	if tcs_enabled and throttle_eff > 0.55 and absf(speed) < top_speed * 0.30 and gear <= 2:
		var excess: float = clampf((0.55 + gear * 0.18) - surface_grip * 0.62, 0.0, 1.0)
		if excess > 0.0:
			tcs_active = true
			_tcs_cut = lerpf(_tcs_cut, excess, delta * 12.0)
	else:
		_tcs_cut = lerpf(_tcs_cut, 0.0, delta * 6.0)
	throttle_eff *= (1.0 - _tcs_cut * 0.75)
	if throttle_eff > 0.0:
		var power_band = clampf(1.0 - pow(kmh / maxf(1.0, top_speed * 3.6), 1.7), 0.0, 1.0)
		accel = engine_accel * throttle_eff * (0.35 + 0.65 * power_band) * surface_grip
		if nitro_active and nitro_amount > 0.0:
			accel += engine_accel * nitro_power * clutch
			nitro_amount = maxf(0.0, nitro_amount - delta / 3.4)
			nitro_used_time += delta
			if nitro_amount <= 0.0:
				nitro_active = false
				nitro_ended.emit()
	# --- ABS: threshold braking. Locked wheels both stop the car slower AND
	# remove all steering, which is the single most common "the game won't turn"
	# complaint. ABS releases just enough pressure to stay at the friction peak.
	abs_active = false
	if brake_input > 0.0:
		var brake_eff: float = brake_input
		if abs_enabled and speed > 3.0 and brake_input > 0.72:
			abs_active = true
			var pressure: float = 0.72 + 0.18 * sin(float(Time.get_ticks_msec()) * 0.05)
			brake_eff = brake_input * pressure
		if speed > 0.5:
			accel -= brake_decel * brake_eff * surface_grip
		elif throttle < 0.05:
			accel -= engine_accel * 0.35 * brake_eff
	if handbrake:
		accel -= brake_decel * 0.55 * surface_grip
	# aero drag + rolling resistance, calibrated so full throttle tops out at top_speed
	var v = absf(speed)
	var v_top = maxf(1.0, top_speed)
	var roll = 0.35
	var drag = maxf(0.0001, engine_accel * 0.35 - roll) / (v_top * v_top)
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
	var speed_norm = clampf(absf(speed) / maxf(1.0, top_speed), 0.0, 1.0)
	var steer_authority = steer_rate * (1.0 - speed_norm * 0.52)
	var turn = steer * steer_authority * (0.35 + speed_norm * 0.9)
	# Lateral grip: high grip resists sliding, handbrake/damage/wetness reduce it.
	# `surface_grip` is what makes grass feel like grass and wet tarmac punish
	# a careless throttle; it is sampled by the race screen, not guessed here.
	var grip_factor = grip * surface_grip * (1.0 - damage * 0.35 - wetness * 0.28)
	grip_factor -= 0.42 if handbrake else 0.0
	grip_factor = clampf(grip_factor, 0.10, 1.0)
	# ABS keeps the front tyres rolling, so you can still steer under full
	# braking; without it, threshold-braking into a corner means understeer.
	var brake_penalty: float = 0.0
	if brake_input > 0.5 and speed > 6.0:
		brake_penalty = 0.10 if abs_active else 0.34
	var target_yaw = turn * clampf(absf(speed) / 14.0, 0.0, 1.0) * (1.0 - brake_penalty)
	if speed < 0.0:
		target_yaw = -target_yaw
	# Yaw response is asymmetric: turning in is quick, catching a slide needs
	# the counter-steer to actually bite, otherwise drifts are unrecoverable.
	var response: float = (3.2 + grip_factor * 5.0)
	if signf(steer) != signf(_yaw_rate) and absf(_yaw_rate) > 0.25:
		response *= 1.55              # counter-steering
	var dt: float = maxf(delta, 0.0001)
	_yaw_rate = lerpf(_yaw_rate, target_yaw, clampf(dt * response, 0.0, 1.0))
	rotation.y += _yaw_rate * delta

	# ---- lateral dynamics ---------------------------------------------------
	# A turning car needs a centripetal force of v * yaw_rate. The tyres can
	# supply a finite amount; anything beyond that becomes sideways velocity.
	# This is the whole difference between gripping and sliding, and it is what
	# the smoke, the marks and the drift score are actually reading.
	var vf: float = speed
	var demand: float = _yaw_rate * vf                     # m/s^2 required
	var capacity: float = grip_factor * 9.81 * 1.45        # m/s^2 available
	var over: float = absf(demand) - capacity
	if over > 0.0:
		# Exceeded: the excess accelerates the mass sideways. The rate is damped
		# because a tyre that has broken away loses progressively less grip, not
		# all of it at once — an undamped version made a fast corner turn into a
		# spin within a second.
		lateral_speed += signf(demand) * over * dt * 0.55
	else:
		# inside the limit: the tyres pull the slide back to zero
		lateral_speed = move_toward(lateral_speed, 0.0, capacity * dt * 1.9)
	if handbrake:
		# A locked rear axle keeps its sideways momentum instead of recovering.
		# The force scales with speed, so a handbrake at 20 km/h is a gentle
		# nudge and at 110 km/h it steps the tail out — which is the whole point
		# of the control. 0.42 of v is about 1.7g at 40 m/s: a real spin, not a
		# cosmetic lean.
		lateral_speed += signf(steer) * absf(vf) * 0.42 * dt
	# Self-aligning torque: a sliding tyre wants to point where the car is going.
	# Without this the car rotates forever once it lets go, which reads as a bug.
	if absf(lateral_speed) > 0.2 and absf(steer) < 0.85:
		var align: float = clampf(absf(lateral_speed) * 0.055, 0.0, 1.4)
		_yaw_rate = move_toward(_yaw_rate, signf(_yaw_rate) * maxf(0.0, absf(_yaw_rate) - align * dt), 10.0)
	# Terminal slide: a car cannot travel more than ~40 deg off its heading and
	# stay on its wheels, so the sideways speed is capped at a fraction of v.
	var limit: float = absf(vf) * 0.62 + 4.0
	lateral_speed = clampf(lateral_speed, -limit, limit)

	slip_angle = atan2(lateral_speed, maxf(1.0, absf(vf)))
	var sideways: float = clampf(absf(lateral_speed) / maxf(6.0, absf(vf)), 0.0, 1.0)
	# `_slip` is the number every effect reads. It is the real sideways fraction,
	# softened so a gentle slide still lays a light mark instead of nothing.
	_slip = clampf(sideways * 1.35, 0.0, 1.0)
	drift_amount = clampf(sideways * 1.15 + (0.2 if handbrake and speed_norm > 0.2 else 0.0), 0.0, 1.0)
	if drift_amount > 0.35 and speed > 8.0:
		drift_time += delta
	# slight roll/pitch visual on the body node
	if _body != null:
		var roll_target = -steer * clampf(speed_norm * 1.4 + drift_amount * 0.5, 0.0, 1.0) * 0.06
		var pitch_target = clampf((throttle - brake_input) * 0.03 + (0.02 if nitro_active else 0.0), -0.05, 0.05)
		_body.rotation.z = lerpf(_body.rotation.z, roll_target, delta * 6.0)
		_body.rotation.x = lerpf(_body.rotation.x, -pitch_target, delta * 5.0)


func _apply_motion(_delta: float) -> void:
	var forward = -global_transform.basis.z
	var side = global_transform.basis.x
	# The velocity is the sum of the two components the tyre model produced. The
	# chassis heading and the travel direction are now genuinely different while
	# the car is sliding, which is what a drift is.
	var motion = forward * speed + side * lateral_speed
	velocity = motion
	_prev_velocity = velocity
	airborne = not is_on_floor() and global_position.y > 1.0
	move_and_slide()
	var hit = false
	var strength = 0.0
	for i in range(get_slide_collision_count()):
		var col = get_slide_collision(i)
		var n = col.get_normal()
		if absf(n.y) > 0.55:
			continue
		var other = col.get_collider()
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
		var steer_vis = steer * 0.42
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
