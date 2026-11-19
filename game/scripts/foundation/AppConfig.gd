class_name AppConfig
extends RefCounted
## Build-wide constants and the canonical art-direction palette.

const APP_NAME := "NovaMira"
const DISPLAY_NAME := "Nova Mira"
const TAGLINE_KEY := "TAGLINE"
const VERSION := "0.2.0-phase1"
const BUILD := "phase1-foundation"
const DEFAULT_SEED := 4021
const DATA_DIR := "res://data/"
const SAVE_PREFIX := "nova_mira_v2_slot_"
const SETTINGS_PATH := "user://nova_mira_settings.json"
const PERF_PATH := "user://nova_mira_perf.json"
const APK_SIZE_LIMIT_BYTES := 200 * 1024 * 1024

## Gritty Mediterranean-noir palette: warm concrete, teal water, sodium lights.
const PALETTE := {
	"asphalt": Color(0.105, 0.115, 0.135),
	"concrete": Color(0.36, 0.35, 0.32),
	"medina_warm": Color(0.48, 0.36, 0.29),
	"harbour_steel": Color(0.24, 0.32, 0.37),
	"sea_teal": Color(0.05, 0.25, 0.36),
	"sodium": Color(1.0, 0.72, 0.38),
	"neon_cyan": Color(0.22, 0.92, 0.82),
	"danger_red": Color(0.86, 0.18, 0.16),
}

static func data_path(file_name: String) -> String:
	return DATA_DIR + file_name
