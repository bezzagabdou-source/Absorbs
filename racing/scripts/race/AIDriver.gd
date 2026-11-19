extends RefCounted
## AI opponent driver: pure-pursuit steering along the track spline with
## speed planning from upcoming curvature, plus occasional nitro and
## rubber-banding toward the player.

const TrackLib = preload("res://scripts/race/TrackLibrary.gd")

var controller
var data
var skill := 0.8
var target_index := 0
var lane := 0.0
var steer_smooth := 0.0
var throttle := 0.0
var brake := 0.0
var nitro := false
var _nitro_cd := 3.0
var _lateral_bias := 0.0
var _bias_timer := 0.0
var _stuck_t := 0.0
var _reverse_t := 0.0


func setup(ctrl, track_data, skill_value: float, lane_offset: float) -> void:
	controller = ctrl
	data = track_data
	skill = clampf(skill_value, 0.55, 1.0)
	lane = lane_offset
	_lateral_bias = lane


func tick(delta: float, player_progress: float, my_progress: float) -> void:
	if controller == null or data == null:
		return
	var pos: Vector3 = controller.global_position
	var prj: Dictionary = data.project(pos, target_index)
	target_index = int(prj["index"])
	var along: float = float(prj["along"])
	var look = 14.0 + controller.linear_speed() * 0.55
	var target: Dictionary = data.sample_distance(along + look)
	var aim: Vector3 = target["pos"] + target["right"] * _lane_offset_now()
	var local := controller.to_local(aim)
	local.y = 0.0
	var desired_yaw := atan2(-local.x, -local.z)
	steer_smooth = lerpf(steer_smooth, clampf(desired_yaw * 1.6, -1.0, 1.0), delta * 7.0)
	# speed planning: sample curvature over the next 60m
	var speed_ms: float = controller.linear_speed()
	var needed := 999.0
	for d in [18.0, 34.0, 52.0, 74.0]:
		var s: Dictionary = data.sample_distance(along + d)
		var t0: Dictionary = data.sample_distance(along + d + 8.0)
		var ang: float = s["tan"].angle_to(t0["tan"])
		var radius: float = 8.0 / maxf(0.001, ang)
		var grip: float = controller.grip_limit() * (0.72 + 0.28 * skill)
		var vmax: float = sqrt(grip * radius)
		needed = minf(needed, vmax)
	var target_speed: float = minf(controller.top_speed * (0.80 + 0.20 * skill), needed)
	if speed_ms > target_speed * 1.06:
		throttle = 0.0
		brake = clampf((speed_ms - target_speed) / maxf(1.0, target_speed), 0.15, 1.0)
	else:
		throttle = 1.0
		brake = 0.0
	# rubber band to keep the race close
	if player_progress - my_progress > 60.0:
		throttle = 1.0
		target_speed *= 1.12
	elif my_progress - player_progress > 90.0:
		throttle = minf(throttle, 0.72)
	# nitro on straights
	_nitro_cd -= delta
	var straight := needed > controller.top_speed * 0.9
	if straight and _nitro_cd <= 0.0 and controller.nitro_amount > 0.35:
		nitro = true
		_nitro_cd = 6.5 / maxf(0.5, skill)
	else:
		nitro = false
	# lane wandering + overtaking bias
	_bias_timer -= delta
	if _bias_timer <= 0.0:
		_bias_timer = randf_range(2.0, 5.0)
		_lateral_bias = lane + randf_range(-1.2, 1.2)
	# unstick
	if speed_ms < 1.5 and throttle > 0.5:
		_stuck_t += delta
	else:
		_stuck_t = 0.0
	if _stuck_t > 1.6:
		_reverse_t = 0.8
		_stuck_t = 0.0
	if _reverse_t > 0.0:
		_reverse_t -= delta
		controller.set_inputs(-1.0, 0.0, -steer_smooth, false, false)
		return
	controller.set_inputs(throttle, brake, steer_smooth, nitro, false)


func _lane_offset_now() -> float:
	var w: float = 7.0
	return clampf(_lateral_bias, -w, w)


## Nearest AI progress along the loop, used for standings.
static func progress_of(track_data, pos: Vector3) -> float:
	var prj: Dictionary = track_data.project(pos)
	return float(prj["along"])
