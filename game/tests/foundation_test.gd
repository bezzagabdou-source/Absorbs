extends SceneTree
## Phase 1 foundation unit tests. Run in CI before the gameplay smoke test.

var failures: int = 0

func _check(condition: bool, label: String) -> void:
	if condition:
		print("[FOUNDATION] PASS ", label)
	else:
		printerr("[FOUNDATION] FAIL ", label)
		failures += 1

func _initialize() -> void:
	# Every foundation script must parse and expose its class.
	for path in [
		"res://scripts/foundation/AppConfig.gd", "res://scripts/foundation/SettingsStore.gd",
		"res://scripts/foundation/Localization3.gd", "res://scripts/foundation/QualityManager.gd",
		"res://scripts/foundation/Benchmark.gd", "res://scripts/foundation/SaveSystemV2.gd",
		"res://scripts/foundation/InputManagerV2.gd", "res://scripts/foundation/DebugOverlay.gd",
		"res://scripts/foundation/PerformanceDashboard.gd",
	]:
		_check(load(path) != null, "parse " + path.get_file())

	print("[FOUNDATION] SECTION localization")
	# Localization: three locales, keys resolve, RTL only for Arabic.
	var loc := Localization3.new("en")
	_check(loc.available_locales().size() == 3, "three locales available")
	_check(loc.t("NEW_GAME") == "New Game", "English key lookup")
	_check(not loc.is_rtl(), "English is LTR")
	loc.set_locale("ar")
	_check(loc.is_rtl(), "Arabic is RTL")
	_check(loc.t("NEW_GAME") == "لعبة جديدة", "Arabic key lookup")
	loc.set_locale("fr")
	_check(loc.t("NEW_GAME") == "Nouvelle partie", "French key lookup")

	print("[FOUNDATION] SECTION quality")
	# Quality tiers: four presets, 50-150% scale range, deterministic tier resolver.
	var q := QualityManager.new()
	_check(q.tiers.size() == 4, "four quality tiers")
	_check(is_equal_approx(q.scale_min, 0.5) and is_equal_approx(q.scale_max, 1.5), "resolution scale range 50-150%")
	q.select("ultra")
	_check(q.index == 3 and int(q.fps_cap) == 120, "ultra tier selects 120 fps cap")
	_check(bool(q.effects.get("ssr", false)), "ultra enables SSR switch")
	q.select(0)
	_check(int(q.fps_cap) == 30 and not bool(q.effects.get("bloom", true)), "low tier disables bloom")
	_check(QualityManager.resolve_tier(6.0) == 3 and QualityManager.resolve_tier(30.0) == 0, "benchmark tier thresholds")

	print("[FOUNDATION] SECTION benchmark")
	# Benchmark analysis with deterministic samples.
	var samples: Array = [8.0, 9.0, 10.0, 11.0, 12.0]
	var result := Benchmark.analyze(samples)
	_check(int(result["samples"]) == 5, "benchmark sample count")
	_check(int(result["suggested_tier"]) == 2, "benchmark suggests medium for 10 ms median")
	_check(Benchmark.analyze([])["samples"] == 0, "empty benchmark is safe")

	print("[FOUNDATION] SECTION saves")
	# Save slots: isolation, migration, corruption tolerance.
	for slot in range(1, 4):
		SaveSystemV2.delete(slot)
	var data := SaveSystemV2.empty_data()
	data["money"] = 100 * 1
	_check(SaveSystemV2.save(1, data), "save slot 1 written")
	data["money"] = 777
	_check(SaveSystemV2.save(2, data), "save slot 2 written")
	_check(int(SaveSystemV2.load_slot(1)["money"]) == 100, "slot isolation")
	_check(SaveSystemV2.has(2) and not SaveSystemV2.has(3), "slot presence flags")
	var legacy := {"version": 1, "data": {"money": 250, "weapon": 2, "ammo": {"pistol": 12}, "locale": "ar"}}
	var migrated := SaveSystemV2.migrate(legacy)
	_check(int(migrated["version"]) == 2, "v1 -> v2 migration version")
	_check(migrated.has("quality") and migrated.has("completed"), "v1 -> v2 new fields")
	_check(SaveSystemV2.save(0, data), "autosave written")
	_check(SaveSystemV2.list_slots().size() == 4, "autosave + 3 slots listed")
	var bad := FileAccess.open(SaveSystemV2.slot_path(3), FileAccess.WRITE)
	bad.store_string("not-encrypted-garbage")
	bad.close()
	_check(SaveSystemV2.load_slot(3).is_empty(), "corrupt slot returns empty safely")

	print("[FOUNDATION] SECTION input")
	# Input bindings: table loaded, rebind emits and persists through API.
	var input := InputManagerV2.new()
	_check(input.bindings.size() >= 17, "input binding table loaded")
	input.press("jump")
	_check(input.pressed("jump") and input.consume_tap("jump"), "virtual press and tap")
	_check(not input.consume_tap("jump"), "tap consumed once")
	input.set_move(Vector2(5, 0))
	_check(input.get_move().length() <= 1.0, "analogue input clamped")
	input.rebind("pause", 82, -1)
	_check((input.bindings["pause"]["keys"] as Array)[0] == 82, "rebinding updates table")

	print("[FOUNDATION] SECTION settings")
	# Settings + telemetry persistence.
	var settings := SettingsStore.new()
	settings.set_value("unit_test", 42)
	_check(settings.flush(), "settings flush")
	var reloaded := SettingsStore.new()
	_check(int(reloaded.get_value("unit_test", -1)) == 42, "settings reload")
	var dash := PerformanceDashboard.new()
	dash.record(8.0, 100.0, 120)
	dash.record(12.0, 110.0, 140)
	_check(int(dash.summary()["count"]) == 2, "telemetry sample count")
	_check(dash.flush(), "telemetry flush")
	_check(AppConfig.PALETTE.size() >= 7, "art direction palette defined")
	_check(AppConfig.APK_SIZE_LIMIT_BYTES == 200 * 1024 * 1024, "APK size gate 200 MB")

	if failures > 0:
		printerr("[FOUNDATION] %d FAILURES" % failures)
		quit(1)
	else:
		print("[FOUNDATION] ALL CHECKS PASSED")
		quit(0)
