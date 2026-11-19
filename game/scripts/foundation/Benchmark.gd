class_name Benchmark
extends Node
## Short first-run frame-time benchmark. Emits a tier recommendation; never blocks
## the main thread because it samples across real frames.

signal finished(result: Dictionary)

func run(seconds: float = 3.0) -> void:
	var samples: Array[float] = []
	var last := Time.get_ticks_usec()
	var until := last + int(seconds * 1000000.0)
	while Time.get_ticks_usec() < until:
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		samples.append(float(now - last) / 1000.0)
		last = now
	var result := analyze(samples)
	finished.emit(result)

static func analyze(samples: Array) -> Dictionary:
	if samples.is_empty():
		return {"samples": 0, "median_ms": 99.0, "p95_ms": 99.0, "avg_ms": 99.0, "fps": 0.0, "suggested_tier": 0}
	var sorted: Array = samples.duplicate(true)
	sorted.sort()
	var total := 0.0
	for v in sorted:
		total += float(v)
	var median := float(sorted[sorted.size() / 2])
	var p95 := float(sorted[clampi(int(float(sorted.size()) * 0.95), 0, sorted.size() - 1)])
	var avg := total / float(sorted.size())
	return {
		"samples": sorted.size(), "median_ms": median, "p95_ms": p95, "avg_ms": avg,
		"fps": 1000.0 / maxf(median, 0.01),
		"suggested_tier": QualityManager.resolve_tier(median),
	}
