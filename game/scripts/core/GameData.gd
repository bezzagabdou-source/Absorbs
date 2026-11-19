class_name GameData
extends RefCounted
## Original IP data tables. No real brands, characters or locations.

const CITY_SIZE := 2000.0
const BLOCK := 100.0
const CHUNK := 200.0

const DISTRICTS := [
	{"id": 0, "name": "Downtown", "name_ar": "وسط المدينة", "color": Color(0.28, 0.32, 0.39), "max_h": 140.0, "density": 0.75},
	{"id": 1, "name": "Waterfront", "name_ar": "الواجهة البحرية", "color": Color(0.30, 0.42, 0.46), "max_h": 55.0, "density": 0.55},
	{"id": 2, "name": "Hillside Villas", "name_ar": "تلال الفيلات", "color": Color(0.42, 0.45, 0.35), "max_h": 18.0, "density": 0.32},
	{"id": 3, "name": "Old Quarter", "name_ar": "الحي القديم", "color": Color(0.48, 0.36, 0.30), "max_h": 32.0, "density": 0.85},
	{"id": 4, "name": "Industrial", "name_ar": "المنطقة الصناعية", "color": Color(0.35, 0.36, 0.33), "max_h": 26.0, "density": 0.48},
	{"id": 5, "name": "Dust Outskirts", "name_ar": "ضواحي الغبار", "color": Color(0.52, 0.44, 0.31), "max_h": 12.0, "density": 0.16},
]

const VEHICLES := [
	{"id": "sedan", "name": "Mira Sedan", "mass": 1200.0, "engine": 180.0, "top": 145.0, "grip": 1.0, "color": Color(0.16, 0.30, 0.52), "price": 0, "type": 0},
	{"id": "sport", "name": "Vermilion GT", "mass": 1050.0, "engine": 240.0, "top": 205.0, "grip": 1.15, "color": Color(0.75, 0.12, 0.12), "price": 28000, "type": 0},
	{"id": "suv", "name": "Atlas 4x4", "mass": 1900.0, "engine": 210.0, "top": 155.0, "grip": 0.95, "color": Color(0.24, 0.31, 0.22), "price": 22000, "type": 0},
	{"id": "van", "name": "Cargo Van", "mass": 2100.0, "engine": 150.0, "top": 125.0, "grip": 0.85, "color": Color(0.78, 0.78, 0.74), "price": 12000, "type": 0},
	{"id": "truck", "name": "Titan Hauler", "mass": 5200.0, "engine": 260.0, "top": 105.0, "grip": 0.7, "color": Color(0.86, 0.55, 0.12), "price": 46000, "type": 0},
	{"id": "police", "name": "City Patrol", "mass": 1450.0, "engine": 210.0, "top": 180.0, "grip": 1.1, "color": Color(0.10, 0.14, 0.22), "price": -1, "type": 0},
	{"id": "ambulance", "name": "LifeLine", "mass": 2300.0, "engine": 195.0, "top": 150.0, "grip": 0.9, "color": Color(0.90, 0.90, 0.88), "price": -1, "type": 0},
	{"id": "bike", "name": "Razor 900", "mass": 220.0, "engine": 95.0, "top": 190.0, "grip": 1.25, "color": Color(0.12, 0.12, 0.15), "price": 15000, "type": 1},
	{"id": "boat", "name": "Tide Runner", "mass": 850.0, "engine": 130.0, "top": 85.0, "grip": 0.8, "color": Color(0.85, 0.84, 0.78), "price": 30000, "type": 2},
	{"id": "heli", "name": "Skyhawk", "mass": 1100.0, "engine": 200.0, "top": 120.0, "grip": 1.0, "color": Color(0.20, 0.24, 0.28), "price": -1, "type": 3},
]

const WEAPONS := [
	{"key": "fist", "name": "Fists", "damage": 9.0, "rate": 0.45, "ammo": -1, "range": 2.0, "spread": 0.0, "projectile": false, "price": 0},
	{"key": "bat", "name": "Bat", "damage": 18.0, "rate": 0.55, "ammo": -1, "range": 2.4, "spread": 0.0, "projectile": false, "price": 300},
	{"key": "pistol", "name": "P-9", "damage": 24.0, "rate": 0.22, "ammo": 12, "range": 120.0, "spread": 0.018, "projectile": false, "price": 900},
	{"key": "smg", "name": "Kestrel SMG", "damage": 13.0, "rate": 0.075, "ammo": 30, "range": 90.0, "spread": 0.045, "projectile": false, "price": 4200},
	{"key": "rifle", "name": "AR-7", "damage": 30.0, "rate": 0.14, "ammo": 24, "range": 180.0, "spread": 0.022, "projectile": false, "price": 8500},
	{"key": "shotgun", "name": "Coastal 12", "damage": 12.0, "rate": 0.8, "ammo": 8, "range": 45.0, "spread": 0.16, "projectile": false, "price": 6100},
	{"key": "sniper", "name": "Longshot", "damage": 95.0, "rate": 1.4, "ammo": 5, "range": 320.0, "spread": 0.004, "projectile": false, "price": 14000},
	{"key": "grenade", "name": "M67 Fragmentation", "damage": 120.0, "rate": 1.2, "ammo": 4, "range": 40.0, "spread": 0.0, "projectile": true, "price": 7500},
]

const STATIONS := ["Nova FM 101", "Sahara Waves", "Midnight Circuit"]

static func district_id(pos: Vector3) -> int:
	var gx := int(clamp(floor((pos.x + CITY_SIZE * 0.5) / (CITY_SIZE / 3.0)), 0, 2))
	var gz := int(clamp(floor((pos.z + CITY_SIZE * 0.5) / (CITY_SIZE / 3.0)), 0, 2))
	return [5, 4, 1, 3, 0, 2, 5, 4, 0][gz * 3 + gx]

static func vehicle(index: int) -> Dictionary:
	return VEHICLES[clamp(index, 0, VEHICLES.size() - 1)]

static func weapon(index: int) -> Dictionary:
	return WEAPONS[clamp(index, 0, WEAPONS.size() - 1)]
