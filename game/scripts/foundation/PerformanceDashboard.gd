class_name PerformanceDashboard
extends RefCounted
## Rolling frame-time/memory telemetry persisted for CI regression checks.

const MAX_SAMPLES := 240
var samples: Array = []

func record(frame_ms: float, memory_mb: float, draw_calls: int) -> void:
	samples.append({
		"t": Time.get_unix_time_from_system(),
		"frame_ms": frame_ms,
		"memory_mb": memory_mb,
		"draw_calls": draw_calls,
	})
	if samples.size() > MAX_SAMPLES:
		samples.pop_front()

func summary() -> Dictionary:
	if samples.is_empty():
		return {"count": 0, "avg_frame_ms": 0.0, "avg_memory_mb": 0.0, "avg_draw_calls": 0}
	var ft := 0.0
	var mem := 0.0
	var draws := 0.0
	for s in samples:
		ft += float(s["frame_ms"])
		mem += float(s["memory_mb"])
		draws += float(s["draw_calls"])
	var n := float(samples.size())
	return {
		"count": samples.size(), "avg_frame_ms": ft / n,
		"avg_memory_mb": mem / n, "avg_draw_calls": int(draws / n),
	}

func flush() -> bool:
	var f := FileAccess.open(AppConfig.PERF_PATH, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify({"version": 1, "samples": samples, "summary": summary()}))
	f.close()
	return true

static func load_summary() -> Dictionary:
	if not FileAccess.file_exists(AppConfig.PERF_PATH):
		return {"count": 0}
	var f := FileAccess.open(AppConfig.PERF_PATH, FileAccess.READ)
	if f == null:
		return {"count": 0}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"count": 0}
	return (parsed as Dictionary).get("summary", {"count": 0})
