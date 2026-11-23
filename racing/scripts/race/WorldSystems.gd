extends Node
## Fuel, repair, day/night cycle and weather — the "living world" layer that sits
## beside the physics instead of inside it.
##
## * FUEL burns with throttle and boost. Running dry does not stop the car dead
##   (that is unplayable); it cuts the engine to a limp 30 % power until you
##   reach a station.
## * REPAIR works the same way: damage above 70 % costs top speed and grip, and
##   a workshop restores it.
## * STATIONS are placed on the highway ring; stopping inside one for a second
##   refuels and repairs for a price.
## * DAY CYCLE advances the sun/moon. In free roam a full day is ~18 real
##   minutes; in a race the time of day is frozen to the track's setting.
## * WEATHER transitions between clear / rain / fog on a timer, driving the
##   environment rig's fog, rain and wetness.

signal refuelled
signal repaired
signal fuel_low
signal broke_down

const TANK_LITRES := 62.0
const IDLE_BURN := 0.0007          ## litres per frame at 60 fps, engine on
const THROTTLE_BURN := 0.016
const BOOST_BURN := 0.055
const DRY_POWER := 0.30
const REPAIR_COST_PER_PERCENT := 45

var car                            ## CarController
var env_rig                        ## EnvironmentRig
var stations: Array = []           ## Array[Vector3]
var fuel: float = TANK_LITRES
var max_fuel: float = TANK_LITRES
var fuel_enabled: bool = true
var cycle_enabled: bool = false
var day_time: float = 0.42         ## 0..1, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
var day_length_seconds: float = 1080.0
var weather: String = "clear"
var weather_timer: float = 240.0
var wetness: float = 0.0
var _low_warned: bool = false
var _in_station: float = 0.0
var _was_dry: bool = false


func setup(car_ref, env_ref, region_profile: String) -> void:
	car = car_ref
	env_rig = env_ref
	match region_profile:
		"desert":
			weather = "clear"
		"alpine":
			weather = "fog"
			wetness = 0.15
		"coast":
			weather = "clear"
		_:
			weather = "rain" if randf() < 0.35 else "clear"
			wetness = 0.35 if weather == "rain" else 0.0


## Place fuel pumps + workshops around the ring. Called by the race screen once
## the open world has produced its road geometry.
func place_stations(ring_radius: float, count: int = 8) -> void:
	stations.clear()
	for i in count:
		var ang: float = TAU * float(i) / float(count) + 0.21
		var r: float = ring_radius + 26.0
		stations.append(Vector3(cos(ang) * r, 0.0, sin(ang) * r))


func fuel_ratio() -> float:
	return clampf(fuel / maxf(1.0, max_fuel), 0.0, 1.0)


func is_dry() -> bool:
	return fuel <= 0.05


## Multiplier the race screen applies to engine_accel so a dry tank limps.
func power_multiplier() -> float:
	return DRY_POWER if is_dry() else 1.0


func repair_cost() -> int:
	if car == null:
		return 0
	return int(car.damage * 100.0) * REPAIR_COST_PER_PERCENT


func tick(delta: float, throttle: float, boosting: bool) -> void:
	if car == null:
		return
	if fuel_enabled and car.input_enabled:
		var burn: float = IDLE_BURN * 60.0 * delta
		burn += THROTTLE_BURN * throttle * delta
		if boosting:
			burn += BOOST_BURN * delta
		fuel = maxf(0.0, fuel - burn)
		if fuel_ratio() < 0.18 and not _low_warned:
			_low_warned = true
			fuel_low.emit()
		if is_dry() and not _was_dry:
			_was_dry = true
			broke_down.emit()
		elif not is_dry() and _was_dry:
			_was_dry = false
	# refuel + repair inside a station footprint
	var near: bool = false
	for s in stations:
		if Vector2(car.global_position.x - s.x, car.global_position.z - s.z).length() < 16.0:
			near = true
			break
	if near and car.speed_kmh() < 12.0:
		_in_station += delta
		if _in_station > 0.8 and fuel < max_fuel * 0.999:
			var missing: float = max_fuel - fuel
			var cost: int = int(ceil(missing * 22.0))
			if Game.spend_credits(cost):
				fuel = max_fuel
				car.repair()
				_low_warned = false
				refuelled.emit()
				repaired.emit()
	else:
		_in_station = 0.0
	# day cycle
	if cycle_enabled:
		day_time = fmod(day_time + delta / day_length_seconds, 1.0)
		_apply_time()
	# weather transitions
	weather_timer -= delta
	if weather_timer <= 0.0:
		weather_timer = randf_range(210.0, 420.0)
		weather = _next_weather()
		_apply_weather()
	wetness = move_toward(wetness, 1.0 if weather == "rain" else maxf(0.0, wetness - delta * 0.02), delta * 0.06)


func _next_weather() -> String:
	match weather:
		"clear":
			return "rain" if randf() < 0.55 else "fog"
		"rain":
			return "clear" if randf() < 0.5 else "fog"
		_:
			return "clear"


func _apply_time() -> void:
	if env_rig == null:
		return
	if env_rig.has_method("set_day_fraction"):
		env_rig.set_day_fraction(day_time)


func _apply_weather() -> void:
	if env_rig == null:
		return
	if env_rig.has_method("set_weather"):
		env_rig.set_weather(weather)


## Hours and minutes for the HUD clock.
func clock_text() -> String:
	var total_min: int = int(day_time * 24.0 * 60.0)
	var h: int = int(total_min / 60) % 24
	var m: int = total_min % 60
	return "%02d:%02d" % [h, m]


func refill_free() -> void:
	fuel = max_fuel
	_low_warned = false
