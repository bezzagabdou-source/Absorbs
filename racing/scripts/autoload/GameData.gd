extends Node
## Static game database: cars, tracks, upgrades, achievements, paints, rims.
## Autoloaded as `GameData`. Read-only at runtime.

const SAVE_VERSION := 3

# ---------------------------------------------------------------- classes
const CLASSES := ["street", "sport", "super", "hyper"]

const CLASS_INFO := {
	"street": {"name": "STREET", "label": "Street", "color": Color("22e9ff"), "tier": 1},
	"sport": {"name": "SPORT", "label": "Sport", "color": Color("65ffaa"), "tier": 2},
	"super": {"name": "SUPER", "label": "Super", "color": Color("ffb020"), "tier": 3},
	"hyper": {"name": "HYPER", "label": "Hyper", "color": Color("ff2e93"), "tier": 4},
}

## Body archetypes drive the procedural 3D mesh (see vehicle/CarModel.gd).
## length/width/height in metres; cabin = roof start/end along length (0..1);
## roof = roof height factor; nose/tail = bonnet/deck heights.
const SHAPES := {
	"hatch": {"length": 3.9, "width": 1.72, "height": 1.46, "cabin": [0.34, 0.72], "roof": 1.0,
		"nose": 0.62, "tail": 0.80, "wing": 0.0, "wheel": 0.31, "stance": 0.0, "bevel": 0.16},
	"sedan": {"length": 4.6, "width": 1.82, "height": 1.42, "cabin": [0.30, 0.66], "roof": 1.0,
		"nose": 0.55, "tail": 0.66, "wing": 0.0, "wheel": 0.32, "stance": 0.0, "bevel": 0.18},
	"coupe": {"length": 4.5, "width": 1.90, "height": 1.30, "cabin": [0.32, 0.63], "roof": 0.94,
		"nose": 0.46, "tail": 0.56, "wing": 0.05, "wheel": 0.335, "stance": 0.1, "bevel": 0.2},
	"muscle": {"length": 4.9, "width": 1.96, "height": 1.34, "cabin": [0.33, 0.60], "roof": 0.96,
		"nose": 0.52, "tail": 0.60, "wing": 0.08, "wheel": 0.35, "stance": 0.15, "bevel": 0.2},
	"sport": {"length": 4.5, "width": 1.92, "height": 1.18, "cabin": [0.34, 0.62], "roof": 0.92,
		"nose": 0.34, "tail": 0.44, "wing": 0.22, "wheel": 0.345, "stance": 0.2, "bevel": 0.22},
	"super": {"length": 4.7, "width": 2.02, "height": 1.12, "cabin": [0.36, 0.60], "roof": 0.92,
		"nose": 0.26, "tail": 0.34, "wing": 0.42, "wheel": 0.36, "stance": 0.28, "bevel": 0.24},
	"hyper": {"length": 4.8, "width": 2.10, "height": 1.04, "cabin": [0.38, 0.60], "roof": 0.90,
		"nose": 0.20, "tail": 0.28, "wing": 0.62, "wheel": 0.37, "stance": 0.34, "bevel": 0.26},
}

## 32 cars. stats are 0..100: speed, accel, handling, brake, nitro.
## body = SHAPES key; price in credits; unlock = required level.
const CARS := [
	# ---------------- STREET (8)
	{"id": "vector_140", "name": "VECTOR 140", "brand": "Kanso", "class": "street", "body": "hatch",
		"stats": {"speed": 34, "accel": 38, "handling": 52, "brake": 46, "nitro": 30},
		"price": 0, "unlock": 1, "color": "22e9ff", "paint": "cyan"},
	{"id": "mirage_gt", "name": "MIRAGE GT", "brand": "Mirage", "class": "street", "body": "coupe",
		"stats": {"speed": 40, "accel": 42, "handling": 48, "brake": 44, "nitro": 34},
		"price": 14500, "unlock": 0, "color": "ffb020", "paint": "amber"},
	{"id": "kestrel_rs", "name": "KESTREL RS", "brand": "Kestrel", "class": "street", "body": "hatch",
		"stats": {"speed": 38, "accel": 40, "handling": 55, "brake": 48, "nitro": 32},
		"price": 18800, "unlock": 2, "color": "65ffaa", "paint": "lime"},
	{"id": "pulsar_v6", "name": "PULSAR V6", "brand": "Pulsar", "class": "street", "body": "sedan",
		"stats": {"speed": 44, "accel": 44, "handling": 46, "brake": 50, "nitro": 36},
		"price": 24500, "unlock": 3, "color": "7c4dff", "paint": "violet"},
	{"id": "cobalt_s", "name": "COBALT S", "brand": "Cobalt", "class": "street", "body": "coupe",
		"stats": {"speed": 46, "accel": 47, "handling": 51, "brake": 49, "nitro": 38},
		"price": 29800, "unlock": 4, "color": "3d8bff", "paint": "blue"},
	{"id": "metro_turbo", "name": "METRO TURBO", "brand": "Metro", "class": "street", "body": "hatch",
		"stats": {"speed": 42, "accel": 50, "handling": 53, "brake": 47, "nitro": 40},
		"price": 33200, "unlock": 5, "color": "ff6a3d", "paint": "orange"},
	{"id": "nova_ex", "name": "NOVA EX", "brand": "Nova", "class": "street", "body": "sedan",
		"stats": {"speed": 48, "accel": 49, "handling": 50, "brake": 52, "nitro": 41},
		"price": 38900, "unlock": 6, "color": "f2f4ff", "paint": "pearl"},
	{"id": "hatch_gt", "name": "HATCH GT", "brand": "Kanso", "class": "street", "body": "hatch",
		"stats": {"speed": 50, "accel": 53, "handling": 56, "brake": 54, "nitro": 43},
		"price": 44500, "unlock": 8, "color": "ff2e93", "paint": "magenta"},

	# ---------------- SPORT (8)
	{"id": "aurora_r", "name": "AURORA R", "brand": "Aurora", "class": "sport", "body": "sport",
		"stats": {"speed": 56, "accel": 58, "handling": 62, "brake": 58, "nitro": 48},
		"price": 62000, "unlock": 9, "color": "22e9ff", "paint": "ice"},
	{"id": "talos_s3", "name": "TALOS S3", "brand": "Talos", "class": "sport", "body": "coupe",
		"stats": {"speed": 58, "accel": 60, "handling": 60, "brake": 60, "nitro": 50},
		"price": 71000, "unlock": 10, "color": "65ffaa", "paint": "mint"},
	{"id": "falcon_gt", "name": "FALCON GT", "brand": "Falcon", "class": "sport", "body": "muscle",
		"stats": {"speed": 62, "accel": 62, "handling": 56, "brake": 58, "nitro": 52},
		"price": 84000, "unlock": 12, "color": "ffb020", "paint": "sunburst"},
	{"id": "zenith_400", "name": "ZENITH 400", "brand": "Zenith", "class": "sport", "body": "sport",
		"stats": {"speed": 64, "accel": 64, "handling": 66, "brake": 62, "nitro": 54},
		"price": 96000, "unlock": 13, "color": "ff2e93", "paint": "rose"},
	{"id": "vipera_sport", "name": "VIPERA SPORT", "brand": "Vipera", "class": "sport", "body": "coupe",
		"stats": {"speed": 66, "accel": 66, "handling": 63, "brake": 64, "nitro": 55},
		"price": 108000, "unlock": 15, "color": "3d8bff", "paint": "cobalt"},
	{"id": "ridge_r", "name": "RIDGE R", "brand": "Ridge", "class": "sport", "body": "sport",
		"stats": {"speed": 68, "accel": 65, "handling": 68, "brake": 65, "nitro": 57},
		"price": 122000, "unlock": 17, "color": "f2f4ff", "paint": "glacier"},
	{"id": "sable_rs", "name": "SABLE RS", "brand": "Sable", "class": "sport", "body": "muscle",
		"stats": {"speed": 70, "accel": 68, "handling": 60, "brake": 62, "nitro": 60},
		"price": 138000, "unlock": 19, "color": "ff6a3d", "paint": "ember"},
	{"id": "lynx_turbo", "name": "LYNX TURBO", "brand": "Lynx", "class": "sport", "body": "coupe",
		"stats": {"speed": 72, "accel": 71, "handling": 70, "brake": 67, "nitro": 62},
		"price": 156000, "unlock": 21, "color": "7c4dff", "paint": "plasma"},

	# ---------------- SUPER (8)
	{"id": "vortex_s9", "name": "VORTEX S9", "brand": "Vortex", "class": "super", "body": "super",
		"stats": {"speed": 76, "accel": 76, "handling": 74, "brake": 72, "nitro": 66},
		"price": 210000, "unlock": 22, "color": "ff2e93", "paint": "neon_pink"},
	{"id": "obsidian_gt", "name": "OBSIDIAN GT", "brand": "Obsidian", "class": "super", "body": "super",
		"stats": {"speed": 78, "accel": 78, "handling": 72, "brake": 74, "nitro": 68},
		"price": 238000, "unlock": 24, "color": "14161f", "paint": "obsidian"},
	{"id": "kaiser_v12", "name": "KAISER V12", "brand": "Kaiser", "class": "super", "body": "super",
		"stats": {"speed": 82, "accel": 79, "handling": 68, "brake": 72, "nitro": 70},
		"price": 268000, "unlock": 26, "color": "ffb020", "paint": "gold"},
	{"id": "halcyon_x", "name": "HALCYON X", "brand": "Halcyon", "class": "super", "body": "super",
		"stats": {"speed": 80, "accel": 81, "handling": 77, "brake": 75, "nitro": 72},
		"price": 298000, "unlock": 28, "color": "22e9ff", "paint": "arctic"},
	{"id": "tempest_super", "name": "TEMPEST", "brand": "Tempest", "class": "super", "body": "super",
		"stats": {"speed": 84, "accel": 83, "handling": 75, "brake": 76, "nitro": 74},
		"price": 332000, "unlock": 30, "color": "3d8bff", "paint": "storm"},
	{"id": "corsa_f8", "name": "CORSA F8", "brand": "Corsa", "class": "super", "body": "super",
		"stats": {"speed": 86, "accel": 84, "handling": 78, "brake": 78, "nitro": 75},
		"price": 366000, "unlock": 32, "color": "ff3b2f", "paint": "race_red"},
	{"id": "helios_gt", "name": "HELIOS GT", "brand": "Helios", "class": "super", "body": "super",
		"stats": {"speed": 88, "accel": 86, "handling": 76, "brake": 80, "nitro": 77},
		"price": 404000, "unlock": 34, "color": "ff8a00", "paint": "solar"},
	{"id": "raptor_s", "name": "RAPTOR S", "brand": "Raptor", "class": "super", "body": "super",
		"stats": {"speed": 90, "accel": 88, "handling": 80, "brake": 81, "nitro": 79},
		"price": 448000, "unlock": 36, "color": "65ffaa", "paint": "toxic"},

	# ---------------- HYPER (8)
	{"id": "apex_x1", "name": "APEX X1", "brand": "Apex", "class": "hyper", "body": "hyper",
		"stats": {"speed": 92, "accel": 90, "handling": 82, "brake": 84, "nitro": 82},
		"price": 620000, "unlock": 38, "color": "22e9ff", "paint": "signature"},
	{"id": "nebula_one", "name": "NEBULA ONE", "brand": "Nebula", "class": "hyper", "body": "hyper",
		"stats": {"speed": 94, "accel": 92, "handling": 84, "brake": 86, "nitro": 84},
		"price": 690000, "unlock": 40, "color": "7c4dff", "paint": "nebula"},
	{"id": "titan_hyper", "name": "TITAN HYPER", "brand": "Titan", "class": "hyper", "body": "hyper",
		"stats": {"speed": 96, "accel": 94, "handling": 80, "brake": 88, "nitro": 86},
		"price": 760000, "unlock": 42, "color": "ffb020", "paint": "bronze"},
	{"id": "phantom_v", "name": "PHANTOM V", "brand": "Phantom", "class": "hyper", "body": "hyper",
		"stats": {"speed": 95, "accel": 95, "handling": 88, "brake": 88, "nitro": 88},
		"price": 840000, "unlock": 44, "color": "f2f4ff", "paint": "phantom"},
	{"id": "eclipse_gtx", "name": "ECLIPSE GTX", "brand": "Eclipse", "class": "hyper", "body": "hyper",
		"stats": {"speed": 97, "accel": 96, "handling": 86, "brake": 90, "nitro": 90},
		"price": 920000, "unlock": 46, "color": "ff2e93", "paint": "eclipse"},
	{"id": "sovereign", "name": "SOVEREIGN", "brand": "Sovereign", "class": "hyper", "body": "hyper",
		"stats": {"speed": 98, "accel": 97, "handling": 87, "brake": 91, "nitro": 92},
		"price": 1040000, "unlock": 48, "color": "cfd6e6", "paint": "chrome"},
	{"id": "nightfall_x", "name": "NIGHTFALL X", "brand": "Nightfall", "class": "hyper", "body": "hyper",
		"stats": {"speed": 99, "accel": 98, "handling": 89, "brake": 92, "nitro": 94},
		"price": 1180000, "unlock": 50, "color": "1b1030", "paint": "midnight"},
	{"id": "aeon_zero", "name": "AEON ZERO", "brand": "Aeon", "class": "hyper", "body": "hyper",
		"stats": {"speed": 100, "accel": 100, "handling": 92, "brake": 94, "nitro": 100},
		"price": 1450000, "unlock": 55, "color": "22ffd8", "paint": "void"},
]

# ---------------------------------------------------------------- paints
const PAINTS := [
	{"id": "cyan", "name": "Neon Cyan", "color": "22e9ff", "price": 0, "finish": 0},
	{"id": "magenta", "name": "Hot Magenta", "color": "ff2e93", "price": 0, "finish": 0},
	{"id": "pearl", "name": "Pearl White", "color": "f2f4ff", "price": 1200, "finish": 2},
	{"id": "obsidian", "name": "Obsidian", "color": "14161f", "price": 1500, "finish": 1},
	{"id": "amber", "name": "Sun Amber", "color": "ffb020", "price": 1800, "finish": 0},
	{"id": "lime", "name": "Acid Lime", "color": "65ffaa", "price": 2200, "finish": 0},
	{"id": "violet", "name": "Ultra Violet", "color": "7c4dff", "price": 2600, "finish": 0},
	{"id": "blue", "name": "Deep Blue", "color": "3d8bff", "price": 2600, "finish": 0},
	{"id": "orange", "name": "Inferno", "color": "ff6a3d", "price": 3000, "finish": 0},
	{"id": "ice", "name": "Ice Chrome", "color": "cfe8ff", "price": 4200, "finish": 2},
	{"id": "mint", "name": "Mint Rush", "color": "a8ffd4", "price": 4200, "finish": 1},
	{"id": "sunburst", "name": "Sunburst", "color": "ffd54a", "price": 4600, "finish": 2},
	{"id": "rose", "name": "Rose Gold", "color": "ff9ec4", "price": 5200, "finish": 2},
	{"id": "cobalt", "name": "Cobalt", "color": "1e4fff", "price": 5200, "finish": 0},
	{"id": "glacier", "name": "Glacier", "color": "dbe9ff", "price": 5600, "finish": 2},
	{"id": "ember", "name": "Ember Matte", "color": "8c2b1b", "price": 6000, "finish": 1},
	{"id": "plasma", "name": "Plasma", "color": "b14dff", "price": 6800, "finish": 2},
	{"id": "neon_pink", "name": "Neon Pink", "color": "ff2e93", "price": 7500, "finish": 2},
	{"id": "gold", "name": "24K Gold", "color": "ffc84d", "price": 9800, "finish": 2},
	{"id": "arctic", "name": "Arctic Gloss", "color": "e8f6ff", "price": 9800, "finish": 0},
	{"id": "storm", "name": "Storm Gray", "color": "5a6c8c", "price": 8600, "finish": 1},
	{"id": "race_red", "name": "Race Red", "color": "e01818", "price": 9200, "finish": 0},
	{"id": "solar", "name": "Solar Flare", "color": "ff8a00", "price": 10500, "finish": 2},
	{"id": "toxic", "name": "Toxic", "color": "b6ff3b", "price": 10500, "finish": 2},
	{"id": "signature", "name": "Signature", "color": "22e9ff", "price": 0, "finish": 2},
	{"id": "nebula", "name": "Nebula", "color": "7c4dff", "price": 12000, "finish": 2},
	{"id": "bronze", "name": "Bronze", "color": "b06a2a", "price": 11000, "finish": 2},
	{"id": "phantom", "name": "Phantom", "color": "f2f4ff", "price": 12500, "finish": 1},
	{"id": "eclipse", "name": "Eclipse", "color": "ff2e93", "price": 13000, "finish": 1},
	{"id": "chrome", "name": "Liquid Chrome", "color": "cfd6e6", "price": 16000, "finish": 2},
	{"id": "midnight", "name": "Midnight", "color": "1b1030", "price": 15000, "finish": 2},
	{"id": "void", "name": "Void Teal", "color": "22ffd8", "price": 18000, "finish": 2},
]

const RIMS := [
	{"id": "stock", "name": "Factory 5", "price": 0, "spokes": 5, "style": 0},
	{"id": "split", "name": "Split 10", "price": 2400, "spokes": 10, "style": 1},
	{"id": "mesh", "name": "Aero Mesh", "price": 4200, "spokes": 12, "style": 2},
	{"id": "blade", "name": "Turbine Blade", "price": 6400, "spokes": 6, "style": 3},
	{"id": "carbon", "name": "Carbon Star", "price": 8800, "spokes": 5, "style": 4},
]

# ---------------------------------------------------------------- upgrades
const UPGRADES := {
	"engine": {"name": "ENGINE", "desc": "Power & top speed", "max": 5,
		"costs": [8000, 18000, 34000, 58000, 92000]},
	"tires": {"name": "TIRES", "desc": "Grip, braking & cornering", "max": 5,
		"costs": [6000, 14000, 26000, 44000, 72000]},
	"turbo": {"name": "TURBO", "desc": "Acceleration & nitro charge", "max": 5,
		"costs": [7000, 16000, 30000, 52000, 84000]},
}

# ---------------------------------------------------------------- tracks
## env: city | desert | mountain | coast ; time: day | sunset | night ; weather: dry | rain
const TRACKS := [
	{"id": "neon_harbor", "name": "NEON HARBOR", "env": "city", "time": "night", "weather": "dry",
		"length": 2.9, "laps": 3, "difficulty": 1, "unlock": 1, "reward": 3400,
		"art": "city_night", "desc": "Downtown loop under the megacity skyline.",
		"gen": {"seed": 11, "radius": 300.0, "harm": [[2, 0.22, 1.1], [3, 0.14, 2.7], [5, 0.06, 0.4],
			[7, 0.03, 1.9]], "hills": 9.0, "width": 16.0}},
	{"id": "shibuya_rain", "name": "SHIBUYA RAIN", "env": "city", "time": "night", "weather": "rain",
		"length": 3.2, "laps": 3, "difficulty": 2, "unlock": 4, "reward": 4200,
		"art": "city_rain", "desc": "Wet neon streets, low grip, zero margin.",
		"gen": {"seed": 23, "radius": 330.0, "harm": [[2, 0.18, 0.4], [3, 0.20, 3.3], [4, 0.10, 1.2],
			[6, 0.05, 2.2]], "hills": 6.0, "width": 15.0}},
	{"id": "dune_fury", "name": "DUNE FURY", "env": "desert", "time": "day", "weather": "dry",
		"length": 3.4, "laps": 3, "difficulty": 2, "unlock": 7, "reward": 4800,
		"art": "desert", "desc": "Open desert sweepers at full throttle.",
		"gen": {"seed": 37, "radius": 380.0, "harm": [[2, 0.16, 2.0], [3, 0.12, 0.9], [4, 0.08, 2.6],
			[8, 0.04, 1.4]], "hills": 16.0, "width": 18.0}},
	{"id": "canyon_storm", "name": "CANYON STORM", "env": "desert", "time": "sunset", "weather": "rain",
		"length": 3.6, "laps": 3, "difficulty": 3, "unlock": 12, "reward": 5600,
		"art": "canyon", "desc": "Canyon walls, slick rock, sunset glare.",
		"gen": {"seed": 53, "radius": 340.0, "harm": [[2, 0.24, 1.6], [3, 0.18, 2.9], [5, 0.08, 0.2],
			[9, 0.04, 2.4]], "hills": 22.0, "width": 14.0}},
	{"id": "alpine_crest", "name": "ALPINE CREST", "env": "mountain", "time": "day", "weather": "dry",
		"length": 3.8, "laps": 3, "difficulty": 3, "unlock": 16, "reward": 6200,
		"art": "mountain", "desc": "Elevation changes and blind crests.",
		"gen": {"seed": 71, "radius": 360.0, "harm": [[2, 0.20, 2.4], [3, 0.16, 0.8], [4, 0.10, 1.8],
			[6, 0.05, 3.0]], "hills": 34.0, "width": 14.0}},
	{"id": "frostbite_pass", "name": "FROSTBITE PASS", "env": "mountain", "time": "night", "weather": "rain",
		"length": 3.9, "laps": 4, "difficulty": 4, "unlock": 24, "reward": 7400,
		"art": "snow", "desc": "Freezing rain, ice patches, elevation.",
		"gen": {"seed": 89, "radius": 350.0, "harm": [[2, 0.22, 1.4], [3, 0.20, 3.6], [5, 0.09, 1.0],
			[8, 0.05, 2.8]], "hills": 40.0, "width": 13.0}},
	{"id": "costa_sunset", "name": "COSTA SUNSET", "env": "coast", "time": "sunset", "weather": "dry",
		"length": 4.1, "laps": 3, "difficulty": 3, "unlock": 30, "reward": 8200,
		"art": "coast", "desc": "Coastal sweepers with the sea in view.",
		"gen": {"seed": 107, "radius": 400.0, "harm": [[2, 0.18, 2.8], [3, 0.12, 1.1], [5, 0.07, 2.0],
			[7, 0.04, 0.6]], "hills": 18.0, "width": 16.0}},
	{"id": "marina_night", "name": "MARINA NIGHT", "env": "coast", "time": "night", "weather": "dry",
		"length": 4.4, "laps": 3, "difficulty": 4, "unlock": 38, "reward": 9600,
		"art": "city_night", "desc": "Harbour bridges at midnight, fast and flowing.",
		"gen": {"seed": 131, "radius": 420.0, "harm": [[2, 0.20, 0.2], [4, 0.12, 2.2], [6, 0.06, 1.5],
			[9, 0.03, 2.9]], "hills": 12.0, "width": 16.0}},
]

const MODES := [
	{"id": "circuit", "name": "CIRCUIT", "desc": "6-car race · 3 laps · first place wins"},
	{"id": "trial", "name": "TIME TRIAL", "desc": "Solo against the clock · 3 laps"},
	{"id": "drag", "name": "DRAG", "desc": "800 m straight · perfect shifts win"},
]

# ---------------------------------------------------------------- economy
const LEVELS := [
	0, 900, 2200, 4000, 6500, 9800, 14000, 19000, 25000, 32000, 40000, 50000, 62000, 76000,
	92000, 110000, 131000, 155000, 182000, 212000, 246000, 284000, 326000, 372000, 422000,
	476000, 534000, 596000, 664000, 738000, 818000, 904000, 996000, 1094000, 1198000, 1308000,
	1424000, 1546000, 1674000, 1808000, 1948000, 2094000, 2246000, 2404000, 2568000, 2738000,
	2914000, 3096000, 3284000, 3478000, 3678000, 3884000, 4096000, 4314000, 4538000, 4768000,
	5004000, 5246000, 5494000, 5748000,
]

const ACHIEVEMENTS := [
	{"id": "first_win", "name": "First Blood", "desc": "Win your first race", "reward": 2500, "icon": "trophy"},
	{"id": "ten_wins", "name": "Serial Winner", "desc": "Win 10 races", "reward": 8000, "icon": "trophy"},
	{"id": "fifty_wins", "name": "Dominator", "desc": "Win 50 races", "reward": 30000, "icon": "trophy"},
	{"id": "first_podium", "name": "On The Box", "desc": "Finish in the top 3", "reward": 1200, "icon": "flag"},
	{"id": "clean_lap", "name": "Surgical", "desc": "Complete a lap with no wall contact", "reward": 3000, "icon": "check"},
	{"id": "nitro_addict", "name": "Nitro Addict", "desc": "Use 3 minutes of nitro", "reward": 4000, "icon": "nitro"},
	{"id": "drift_king", "name": "Drift King", "desc": "Drift for 60 seconds total", "reward": 5000, "icon": "wheel"},
	{"id": "speed_demon", "name": "Speed Demon", "desc": "Hit 300 km/h", "reward": 6000, "icon": "gauge"},
	{"id": "hyper_speed", "name": "Beyond Physics", "desc": "Hit 380 km/h", "reward": 15000, "icon": "bolt"},
	{"id": "first_car", "name": "Collector", "desc": "Buy your second car", "reward": 2000, "icon": "garage"},
	{"id": "ten_cars", "name": "Garage Goals", "desc": "Own 10 cars", "reward": 20000, "icon": "garage"},
	{"id": "twenty_cars", "name": "Fleet Admiral", "desc": "Own 20 cars", "reward": 60000, "icon": "garage"},
	{"id": "all_classes", "name": "Full Spectrum", "desc": "Own a car in every class", "reward": 25000, "icon": "star"},
	{"id": "tuner", "name": "Tuner", "desc": "Max out any upgrade", "reward": 12000, "icon": "engine"},
	{"id": "perfectionist", "name": "Perfectionist", "desc": "Max all upgrades on one car", "reward": 40000, "icon": "gear"},
	{"id": "painter", "name": "Artist", "desc": "Repaint a car 5 times", "reward": 3000, "icon": "paint"},
	{"id": "rim_king", "name": "Fitment Guru", "desc": "Buy 3 rim sets", "reward": 4000, "icon": "wheel"},
	{"id": "all_tracks", "name": "Globetrotter", "desc": "Race on all 8 tracks", "reward": 18000, "icon": "flag"},
	{"id": "night_owl", "name": "Night Owl", "desc": "Win a night race", "reward": 3500, "icon": "moon"},
	{"id": "rain_master", "name": "Rain Master", "desc": "Win in the rain", "reward": 4500, "icon": "rain"},
	{"id": "level_10", "name": "Rising Star", "desc": "Reach level 10", "reward": 8000, "icon": "star"},
	{"id": "level_25", "name": "Veteran", "desc": "Reach level 25", "reward": 22000, "icon": "star"},
	{"id": "level_50", "name": "Legend", "desc": "Reach level 50", "reward": 80000, "icon": "trophy"},
	{"id": "daily_streak", "name": "Committed", "desc": "Claim 7 daily rewards in a row", "reward": 10000, "icon": "clock"},
]

const DAILY_REWARDS := [
	{"credits": 1200, "label": "1.2K"},
	{"credits": 1800, "label": "1.8K"},
	{"credits": 2600, "label": "2.6K"},
	{"credits": 3800, "label": "3.8K"},
	{"credits": 5200, "label": "5.2K"},
	{"credits": 7600, "label": "7.6K"},
	{"credits": 15000, "label": "15K", "bonus": "nitro_charm"},
]

const AI_NAMES := ["VEX", "KYRA", "RONIN", "NOVA", "DRAKE", "SABLE", "ORION", "ZARA", "JAX", "LYRA"]
const AI_COLORS := ["ff2e93", "22e9ff", "65ffaa", "ffb020", "7c4dff", "ff6a3d"]

# ---------------------------------------------------------------- helpers
func car_by_id(id: String) -> Dictionary:
	for c in CARS:
		if c.id == id:
			return c
	return {}


func cars_in_class(cls: String) -> Array:
	return CARS.filter(func(c): return c["class"] == cls)


func track_by_id(id: String) -> Dictionary:
	for t in TRACKS:
		if t.id == id:
			return t
	return {}


func paint_by_id(id: String) -> Dictionary:
	for p in PAINTS:
		if p.id == id:
			return p
	return PAINTS[0]


func rim_by_id(id: String) -> Dictionary:
	for r in RIMS:
		if r.id == id:
			return r
	return RIMS[0]


func achievement_by_id(id: String) -> Dictionary:
	for a in ACHIEVEMENTS:
		if a.id == id:
			return a
	return {}


## Effective 0..100 stats after upgrade levels (engine/tires/turbo 0..5).
func tuned_stats(car: Dictionary, upgrade_levels: Dictionary) -> Dictionary:
	var st: Dictionary = car["stats"].duplicate()
	var e: int = int(upgrade_levels.get("engine", 0))
	var t: int = int(upgrade_levels.get("tires", 0))
	var b: int = int(upgrade_levels.get("turbo", 0))
	st["speed"] = mini(100, int(st["speed"]) + e * 5)
	st["accel"] = mini(100, int(st["accel"]) + b * 5)
	st["handling"] = mini(100, int(st["handling"]) + t * 5)
	st["brake"] = mini(100, int(st["brake"]) + t * 4)
	st["nitro"] = mini(100, int(st["nitro"]) + b * 4 + e * 1)
	return st


func stat_rating(stats: Dictionary) -> int:
	var total = 0
	for k in stats:
		total += int(stats[k])
	return int(round(float(total) / float(stats.size())))


## Physical tuning derived from 0..100 stats. Units: m/s, m/s^2, radians.
func physics_for(car: Dictionary, upgrade_levels: Dictionary) -> Dictionary:
	var st = tuned_stats(car, upgrade_levels)
	var top_kmh = lerpf(168.0, 412.0, pow(float(st["speed"]) / 100.0, 1.35))
	var accel = lerpf(4.0, 10.4, pow(float(st["accel"]) / 100.0, 1.6))
	var grip = lerpf(0.78, 0.96, float(st["handling"]) / 100.0)
	var brake_decel = lerpf(9.0, 21.0, float(st["brake"]) / 100.0)
	var nitro_power = lerpf(0.22, 0.62, float(st["nitro"]) / 100.0)
	var steer = lerpf(1.55, 1.92, float(st["handling"]) / 100.0)
	return {
		"top_speed_ms": top_kmh / 3.6,
		"top_kmh": top_kmh,
		"accel": accel,
		"grip": grip,
		"brake": brake_decel,
		"nitro": nitro_power,
		"steer": steer,
		"mass": clampf(lerpf(1250.0, 1580.0, float(st["speed"]) / 100.0), 1100.0, 1700.0),
	}


func xp_for_level(level: int) -> int:
	if level <= 0:
		return 0
	if level - 1 >= LEVELS.size():
		return LEVELS[LEVELS.size() - 1] + (level - LEVELS.size()) * 300000
	return LEVELS[level - 1]


func level_for_xp(xp: int) -> int:
	var lvl = 1
	for i in range(LEVELS.size()):
		if xp >= LEVELS[i]:
			lvl = i + 1
		else:
			break
	return lvl


func level_progress(xp: int) -> Dictionary:
	var lvl = level_for_xp(xp)
	var cur = xp_for_level(lvl)
	var nxt = xp_for_level(lvl + 1)
	var span: int = maxi(1, nxt - cur)
	return {"level": lvl, "cur": xp, "start": cur, "next": nxt,
		"frac": clampf(float(xp - cur) / float(span), 0.0, 1.0)}


func total_cars() -> int:
	return CARS.size()


func price_range(cls: String) -> Vector2i:
	var lo = 99999999
	var hi = 0
	for c in cars_in_class(cls):
		lo = mini(lo, int(c["price"]))
		hi = maxi(hi, int(c["price"]))
	return Vector2i(lo, hi)
