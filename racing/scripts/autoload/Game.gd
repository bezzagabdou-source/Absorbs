extends Node
## Player profile + economy + progression. Autoloaded as `Game`.
## Persists to user://profile.json atomically (write temp, rename).

signal credits_changed(total: int)
signal xp_changed(xp: int, level: int)
signal car_bought(car_id: String)
signal car_selected(car_id: String)
signal achievement_unlocked(id: String)
signal stats_changed

const PATH := "user://profile.json"
const TMP_PATH := "user://profile.json.tmp"

var data: Dictionary = {}


func _ready() -> void:
	_build_audio_buses()
	load_profile()


func _build_audio_buses() -> void:
	var wanted = ["Music", "SFX", "Engine", "Ambience"]
	for bus_name in wanted:
		if AudioServer.get_bus_index(bus_name) < 0:
			AudioServer.add_bus()
			var idx = AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")
	SettingsStore.apply_all()


## ------------------------------------------------------------------ profile
func default_profile() -> Dictionary:
	return {
		"version": GameData.SAVE_VERSION,
		"credits": 42000,
		"xp": 0,
		"owned": {
			"vector_140": {"paint": "cyan", "rim": "stock",
				"upgrades": {"engine": 0, "tires": 0, "turbo": 0}},
		},
		"selected": "vector_140",
		"stats": {
			"races": 0, "wins": 0, "podiums": 0, "distance_km": 0.0, "top_speed": 0.0,
			"drift_time": 0.0, "nitro_time": 0.0, "paints_changed": 0, "rims_bought": 0,
			"tracks_raced": [], "total_time": 0.0, "drag_wins": 0,
		},
		"achievements": {},
		"best_laps": {},
		"daily": {"last_day": -1, "streak": 0, "claimed_today": false},
		"unlocks": [],
	}


func load_profile() -> void:
	data = default_profile()
	if FileAccess.file_exists(PATH):
		var f = FileAccess.open(PATH, FileAccess.READ)
		if f:
			var txt = f.get_as_text()
			f.close()
			var parsed = JSON.parse_string(txt)
			if parsed is Dictionary:
				_merge_into_default(parsed)
			else:
				_quarantine_corrupt()
	else:
		save_profile()


func _merge_into_default(parsed: Dictionary) -> void:
	var base = default_profile()
	for k in base.keys():
		if parsed.has(k):
			base[k] = parsed[k]
	# structural repairs (older saves / hand-edited files)
	if not (base["owned"] is Dictionary) or base["owned"].is_empty():
		base["owned"] = default_profile()["owned"]
	for cid in base["owned"].keys():
		var rec: Dictionary = base["owned"][cid]
		if not (rec is Dictionary):
			base["owned"][cid] = {"paint": "cyan", "rim": "stock",
				"upgrades": {"engine": 0, "tires": 0, "turbo": 0}}
			continue
		if not rec.has("paint") or GameData.paint_by_id(str(rec.get("paint", ""))).is_empty():
			rec["paint"] = "cyan"
		if not rec.has("rim") or GameData.rim_by_id(str(rec.get("rim", ""))).is_empty():
			rec["rim"] = "stock"
		var ups: Dictionary = rec.get("upgrades", {})
		for u in GameData.UPGRADES.keys():
			ups[u] = clampi(int(ups.get(u, 0)), 0, GameData.UPGRADES[u]["max"])
		rec["upgrades"] = ups
	if not base["owned"].has(str(base.get("selected", ""))):
		base["selected"] = str(base["owned"].keys()[0])
	if base["stats"] is Dictionary:
		var st: Dictionary = base["stats"]
		for k in default_profile()["stats"].keys():
			if not st.has(k):
				st[k] = default_profile()["stats"][k]
	else:
		base["stats"] = default_profile()["stats"]
	if not (base["achievements"] is Dictionary):
		base["achievements"] = {}
	if not (base["best_laps"] is Dictionary):
		base["best_laps"] = {}
	if not (base["daily"] is Dictionary):
		base["daily"] = {"last_day": -1, "streak": 0, "claimed_today": false}
	data = base


func _quarantine_corrupt() -> void:
	var broken = "%s.corrupt-%d" % [PATH, int(Time.get_unix_time_from_system())]
	DirAccess.rename_absolute(PATH, broken)
	push_warning("Corrupted profile quarantined to " + broken)


func save_profile() -> void:
	data["version"] = GameData.SAVE_VERSION
	var f = FileAccess.open(TMP_PATH, FileAccess.WRITE)
	if not f:
		push_error("cannot open profile for writing")
		return
	f.store_string(JSON.stringify(data, "  "))
	f.close()
	var d = DirAccess.open("user://")
	if d:
		if d.file_exists("profile.json"):
			d.remove("profile.json")
		d.rename("profile.json.tmp", "profile.json")


## ------------------------------------------------------------------ economy
func credits() -> int:
	return int(data.get("credits", 0))


func add_credits(amount: int) -> void:
	data["credits"] = maxi(0, credits() + amount)
	credits_changed.emit(credits())
	save_profile()


func spend_credits(amount: int) -> bool:
	if credits() < amount:
		return false
	data["credits"] = credits() - amount
	credits_changed.emit(credits())
	save_profile()
	return true


func add_xp(amount: int) -> Dictionary:
	var before = level()
	data["xp"] = int(data.get("xp", 0)) + maxi(0, amount)
	var after = level()
	xp_changed.emit(int(data["xp"]), after)
	var result: Dictionary = {"levels_gained": maxi(0, after - before), "level": after}
	check_level_achievements()
	save_profile()
	return result


func xp() -> int:
	return int(data.get("xp", 0))


func level() -> int:
	return GameData.level_for_xp(xp())


func level_progress() -> Dictionary:
	return GameData.level_progress(xp())


## ------------------------------------------------------------------ cars
func owns(car_id: String) -> bool:
	return data["owned"].has(car_id)


func owned_ids() -> Array:
	return data["owned"].keys()


func owned_count() -> int:
	return data["owned"].size()


func car_record(car_id: String) -> Dictionary:
	return data["owned"].get(car_id, {})


func selected_car_id() -> String:
	return str(data.get("selected", "vector_140"))


func selected_car() -> Dictionary:
	var info = GameData.car_by_id(selected_car_id())
	if info.is_empty():
		info = GameData.CARS[0]
	return info


func select_car(car_id: String) -> void:
	if not owns(car_id):
		return
	data["selected"] = car_id
	car_selected.emit(car_id)
	save_profile()


func buy_car(car_id: String) -> bool:
	var info = GameData.car_by_id(car_id)
	if info.is_empty() or owns(car_id):
		return false
	if level() < int(info.get("unlock", 0)):
		return false
	if not spend_credits(int(info["price"])):
		return false
	data["owned"][car_id] = {"paint": str(info.get("paint", "cyan")), "rim": "stock",
		"upgrades": {"engine": 0, "tires": 0, "turbo": 0}}
	car_bought.emit(car_id)
	unlock_achievement_by_condition("first_car")
	if owned_count() >= 10:
		unlock_achievement_by_condition("ten_cars")
	if owned_count() >= 20:
		unlock_achievement_by_condition("twenty_cars")
	_check_all_classes()
	save_profile()
	return true


func _check_all_classes() -> void:
	var classes: Dictionary = {}
	for cid in data["owned"].keys():
		var info = GameData.car_by_id(str(cid))
		if not info.is_empty():
			classes[info["class"]] = true
	if classes.size() >= 4:
		unlock_achievement_by_condition("all_classes")


func set_paint(car_id: String, paint_id: String) -> bool:
	if not owns(car_id):
		return false
	data["owned"][car_id]["paint"] = paint_id
	data["stats"]["paints_changed"] = int(data["stats"].get("paints_changed", 0)) + 1
	if int(data["stats"]["paints_changed"]) >= 5:
		unlock_achievement_by_condition("painter")
	save_profile()
	return true


func set_rim(car_id: String, rim_id: String) -> void:
	if owns(car_id):
		data["owned"][car_id]["rim"] = rim_id
		save_profile()


func upgrade_level(car_id: String, kind: String) -> int:
	return int(car_record(car_id).get("upgrades", {}).get(kind, 0))


func upgrade_cost(car_id: String, kind: String) -> int:
	var lvl = upgrade_level(car_id, kind)
	var info: Dictionary = GameData.UPGRADES.get(kind, {})
	var costs: Array = info.get("costs", [])
	if lvl >= costs.size():
		return -1
	return int(costs[lvl])


func buy_upgrade(car_id: String, kind: String) -> bool:
	if not owns(car_id):
		return false
	var cost = upgrade_cost(car_id, kind)
	if cost < 0 or not spend_credits(cost):
		return false
	var ups: Dictionary = data["owned"][car_id]["upgrades"]
	ups[kind] = int(ups.get(kind, 0)) + 1
	var mx: int = GameData.UPGRADES[kind]["max"]
	if int(ups[kind]) >= mx:
		unlock_achievement_by_condition("tuner")
	var all_max = true
	for u in GameData.UPGRADES.keys():
		if int(ups.get(u, 0)) < int(GameData.UPGRADES[u]["max"]):
			all_max = false
	if all_max:
		unlock_achievement_by_condition("perfectionist")
	save_profile()
	return true


func buy_rim(rim_id: String) -> bool:
	var rim = GameData.rim_by_id(rim_id)
	if rim.is_empty():
		return false
	if data.get("rims_owned", []).has(rim_id):
		return true
	if not spend_credits(int(rim["price"])):
		return false
	var owned_rims: Array = data.get("rims_owned", [])
	owned_rims.append(rim_id)
	data["rims_owned"] = owned_rims
	data["stats"]["rims_bought"] = int(data["stats"].get("rims_bought", 0)) + 1
	if int(data["stats"]["rims_bought"]) >= 3:
		unlock_achievement_by_condition("rim_king")
	save_profile()
	return true


func owns_rim(rim_id: String) -> bool:
	return rim_id == "stock" or data.get("rims_owned", []).has(rim_id)


func buy_paint(paint_id: String) -> bool:
	if data.get("paints_owned", []).has(paint_id):
		return true
	var p = GameData.paint_by_id(paint_id)
	if p.is_empty() or not spend_credits(int(p["price"])):
		return false
	var owned_paints: Array = data.get("paints_owned", [])
	owned_paints.append(paint_id)
	data["paints_owned"] = owned_paints
	save_profile()
	return true


func owns_paint(paint_id: String) -> bool:
	return int(GameData.paint_by_id(paint_id).get("price", 0)) == 0 \
		or data.get("paints_owned", []).has(paint_id)


func tuned_stats(car_id: String) -> Dictionary:
	var info = GameData.car_by_id(car_id)
	if info.is_empty():
		return {}
	return GameData.tuned_stats(info, car_record(car_id).get("upgrades", {}))


func physics_for(car_id: String) -> Dictionary:
	var info = GameData.car_by_id(car_id)
	if info.is_empty():
		info = GameData.CARS[0]
	return GameData.physics_for(info, car_record(car_id).get("upgrades", {}))


## ------------------------------------------------------------------ records
func record_race(result: Dictionary) -> void:
	var st: Dictionary = data["stats"]
	st["races"] = int(st.get("races", 0)) + 1
	if int(result.get("position", 99)) == 1:
		st["wins"] = int(st.get("wins", 0)) + 1
	if int(result.get("position", 99)) <= 3:
		st["podiums"] = int(st.get("podiums", 0)) + 1
	st["distance_km"] = float(st.get("distance_km", 0.0)) + float(result.get("distance_km", 0.0))
	st["top_speed"] = maxf(float(st.get("top_speed", 0.0)), float(result.get("top_speed", 0.0)))
	st["drift_time"] = float(st.get("drift_time", 0.0)) + float(result.get("drift_time", 0.0))
	st["nitro_time"] = float(st.get("nitro_time", 0.0)) + float(result.get("nitro_time", 0.0))
	st["total_time"] = float(st.get("total_time", 0.0)) + float(result.get("time", 0.0))
	var tracks: Array = st.get("tracks_raced", [])
	var tid = str(result.get("track", ""))
	if tid != "" and not tracks.has(tid):
		tracks.append(tid)
	st["tracks_raced"] = tracks
	if int(result.get("position", 99)) == 1:
		unlock_achievement_by_condition("first_win")
		if int(st["wins"]) >= 10:
			unlock_achievement_by_condition("ten_wins")
		if int(st["wins"]) >= 50:
			unlock_achievement_by_condition("fifty_wins")
		if str(result.get("time_of_day", "")) == "night":
			unlock_achievement_by_condition("night_owl")
		if str(result.get("weather", "")) == "rain":
			unlock_achievement_by_condition("rain_master")
	if int(result.get("position", 99)) <= 3:
		unlock_achievement_by_condition("first_podium")
	if bool(result.get("clean_lap", false)):
		unlock_achievement_by_condition("clean_lap")
	if float(st["drift_time"]) >= 60.0:
		unlock_achievement_by_condition("drift_king")
	if float(st["nitro_time"]) >= 180.0:
		unlock_achievement_by_condition("nitro_addict")
	if float(st["top_speed"]) >= 300.0:
		unlock_achievement_by_condition("speed_demon")
	if float(st["top_speed"]) >= 380.0:
		unlock_achievement_by_condition("hyper_speed")
	if tracks.size() >= GameData.TRACKS.size():
		unlock_achievement_by_condition("all_tracks")
	var best: Dictionary = data["best_laps"]
	var bt = float(result.get("best_lap", 0.0))
	var prev = float(best.get(tid, 0.0))
	if bt > 0.0 and (prev <= 0.0 or bt < prev):
		best[tid] = bt
	stats_changed.emit()
	save_profile()


func best_lap(track_id: String) -> float:
	return float(data["best_laps"].get(track_id, 0.0))


## ------------------------------------------------------------------ awards
func unlocked(id: String) -> bool:
	return bool(data["achievements"].get(id, {}).get("unlocked", false))


func claimed(id: String) -> bool:
	return bool(data["achievements"].get(id, {}).get("claimed", false))


func unlock_achievement_by_condition(id: String) -> void:
	if id == "" or unlocked(id):
		return
	var info = GameData.achievement_by_id(id)
	if info.is_empty():
		return
	data["achievements"][id] = {"unlocked": true, "claimed": false}
	achievement_unlocked.emit(id)
	save_profile()


func claim_achievement(id: String) -> bool:
	var rec: Dictionary = data["achievements"].get(id, {})
	if not bool(rec.get("unlocked", false)) or bool(rec.get("claimed", false)):
		return false
	rec["claimed"] = true
	data["achievements"][id] = rec
	add_credits(int(GameData.achievement_by_id(id).get("reward", 0)))
	save_profile()
	return true


func claimable_achievements() -> Array:
	var out: Array = []
	for a in GameData.ACHIEVEMENTS:
		var rec: Dictionary = data["achievements"].get(a["id"], {})
		if bool(rec.get("unlocked", false)) and not bool(rec.get("claimed", false)):
			out.append(a["id"])
	return out


func check_level_achievements() -> void:
	if level() >= 10:
		unlock_achievement_by_condition("level_10")
	if level() >= 25:
		unlock_achievement_by_condition("level_25")
	if level() >= 50:
		unlock_achievement_by_condition("level_50")


## ------------------------------------------------------------------ daily
func _local_day_index() -> int:
	var t = Time.get_datetime_dict_from_system()
	var unix = Time.get_unix_time_from_datetime_dict(t)
	return int(unix / 86400.0)


func daily_state() -> Dictionary:
	var d: Dictionary = data["daily"]
	var today = _local_day_index()
	var last = int(d.get("last_day", -1))
	var claimed_today: bool = last == today
	var streak = int(d.get("streak", 0))
	if last < today - 1:
		streak = 0
	return {"can_claim": not claimed_today, "day_index": mini(streak, 6), "streak": streak,
		"claimed_today": claimed_today, "today": today}


func claim_daily() -> Dictionary:
	var st = daily_state()
	if not st["can_claim"]:
		return {}
	var d: Dictionary = data["daily"]
	var today: int = int(st["today"])
	var streak = int(d.get("streak", 0))
	if int(d.get("last_day", -1)) == today - 1:
		streak += 1
	else:
		streak = 1
	d["last_day"] = today
	d["streak"] = streak
	data["daily"] = d
	var idx: int = (streak - 1) % GameData.DAILY_REWARDS.size()
	var reward: Dictionary = GameData.DAILY_REWARDS[idx]
	var amount: int = int(reward["credits"])
	add_credits(amount)
	if streak >= 7:
		unlock_achievement_by_condition("daily_streak")
	save_profile()
	return {"credits": amount, "day": idx + 1, "streak": streak, "bonus": reward.get("bonus", "")}


## ------------------------------------------------------------------ misc
func reset_progress() -> void:
	data = default_profile()
	save_profile()
	credits_changed.emit(credits())
	xp_changed.emit(xp(), level())
	stats_changed.emit()


func total_distance_km() -> float:
	return float(data["stats"].get("distance_km", 0.0))


func format_credits(v: int) -> String:
	var s = str(absi(v))
	var out = ""
	var count = 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	return out
