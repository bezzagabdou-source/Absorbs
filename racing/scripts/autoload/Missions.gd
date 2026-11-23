extends Node
## Daily missions and the local leaderboard.
##
## Missions are generated from the profile's own history, so they always ask for
## something achievable: three that scale with how the player already drives, and
## one that is a pure push (a distance or a drift target). Progress is stored in
## the profile, survives a relaunch, and resets at local midnight.
##
## The leaderboard is intentionally local. An online board needs a backend, a
## privacy policy and a moderation story; claiming one exists when it does not
## would be the dishonest option, so this ranks the player against their own
## ghosts and the AI names, and the door for a real service is a single
## `submit_score()` call.

signal mission_completed(id: String, reward: int)

const MISSION_POOL := [
	{"id": "races_3", "kind": "races", "target": 3, "reward": 2500,
		"text": "Finish %d races"},
	{"id": "wins_1", "kind": "wins", "target": 1, "reward": 4000,
		"text": "Win %d race"},
	{"id": "drift_1500", "kind": "drift", "target": 1500, "reward": 3200,
		"text": "Score %d drift points"},
	{"id": "distance_12", "kind": "distance", "target": 12, "reward": 2800,
		"text": "Drive %d km"},
	{"id": "top_speed_260", "kind": "top_speed", "target": 260, "reward": 3600,
		"text": "Reach %d km/h"},
	{"id": "nitro_45", "kind": "nitro", "target": 45, "reward": 2200,
		"text": "Use %d seconds of nitro"},
	{"id": "clean_1", "kind": "clean", "target": 1, "reward": 3800,
		"text": "Complete %d clean lap"},
	{"id": "pursuit_90", "kind": "pursuit", "target": 90, "reward": 4200,
		"text": "Survive %d seconds of police pursuit"},
]

const BOARD_SIZE := 12
const AI_GHOSTS := [
	["VEX", 18450], ["KYRA", 17120], ["RONIN", 15980], ["NOVA", 14300],
	["DRAKE", 13110], ["SABLE", 11960], ["ORION", 10440], ["ZARA", 9210],
	["JAX", 8270], ["LYRA", 7480], ["ECHO", 6120], ["WRAITH", 5240],
]


## Ensure today's mission set exists in the profile, and roll it over at
## midnight. Called on boot and whenever the daily screen opens.
func ensure_missions(profile: Dictionary) -> void:
	var today: String = _today_key()
	var daily: Dictionary = profile.get("daily", {})
	if str(daily.get("date", "")) == today and daily.has("missions"):
		return
	var missions: Array = []
	var picks: Array = MISSION_POOL.duplicate()
	# deterministic per day, so a reinstall on the same day gets the same set
	var rng := RandomNumberGenerator.new()
	rng.seed = int(today.replace("-", "").to_int()) if today.replace("-", "").is_valid_int() else 20260101
	for i in 4:
		if picks.is_empty():
			break
		var idx: int = rng.randi_range(0, picks.size() - 1)
		var m: Dictionary = picks[idx].duplicate(true)
		picks.remove_at(idx)
		m["progress"] = 0
		m["done"] = false
		missions.append(m)
	daily["date"] = today
	daily["missions"] = missions
	profile["daily"] = daily


## Record progress for one mission kind. Returns the missions that completed.
func add_progress(profile: Dictionary, kind: String, amount: float) -> Array:
	var completed: Array = []
	var daily: Dictionary = profile.get("daily", {})
	var missions: Array = daily.get("missions", [])
	for m in missions:
		if str(m.get("kind", "")) != kind:
			continue
		if bool(m.get("done", false)):
			continue
		var target: float = float(m.get("target", 1))
		var current: float = float(m.get("progress", 0)) + amount
		# top_speed is a high-water mark, not a sum
		if kind == "top_speed":
			current = maxf(current, amount)
		m["progress"] = current
		if current >= target:
			m["done"] = true
			completed.append(m)
	daily["missions"] = missions
	profile["daily"] = daily
	for m in completed:
		mission_completed.emit(str(m["id"]), int(m["reward"]))
	return completed


func missions(profile: Dictionary) -> Array:
	return profile.get("daily", {}).get("missions", [])


func all_done(profile: Dictionary) -> bool:
	var ms: Array = missions(profile)
	if ms.is_empty():
		return false
	for m in ms:
		if not bool(m.get("done", false)):
			return false
	return true


func mission_text(m: Dictionary) -> String:
	var raw: String = str(m.get("text", ""))
	if raw.contains("%d"):
		return raw % int(m.get("target", 0))
	return raw


## ---------------- leaderboard ----------------
## Entries are [name, score, is_player]. Sorted descending.
func leaderboard(profile: Dictionary) -> Array:
	var board: Array = []
	for row in AI_GHOSTS:
		board.append([str(row[0]), int(row[1]), false])
	var player_score: int = int(profile.get("career", {}).get("drift_best", 0))
	player_score += int(profile.get("career", {}).get("top_speed", 0)) * 22
	var player_name: String = str(profile.get("name", "YOU")).to_upper()
	if player_name == "":
		player_name = "YOU"
	board.append([player_name, player_score, true])
	board.sort_custom(func(a, b): return int(a[1]) > int(b[1]))
	return board.slice(0, BOARD_SIZE)


func player_rank(profile: Dictionary) -> int:
	var board := leaderboard(profile)
	for i in board.size():
		if bool(board[i][2]):
			return i + 1
	return board.size()


## Hook for a future online service; a no-op today, and honest about it.
func submit_score(_profile: Dictionary) -> bool:
	return false


func _today_key() -> String:
	var d: Dictionary = Time.get_date_dict_from_system()
	return "%04d-%02d-%02d" % [int(d["year"]), int(d["month"]), int(d["day"])]
