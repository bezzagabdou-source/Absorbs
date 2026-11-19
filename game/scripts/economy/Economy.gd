class_name Economy
extends RefCounted
## Wallet, shops, vehicle upgrades, properties and passive income.

var player: PlayerController
var bus: EventBus
var properties: Array[String] = []
var owned_vehicles: Array[int] = [0]
var upgrades: Dictionary = {"engine": 0, "armour": 0, "brakes": 0}
var _income_timer: float = 0.0

const SHOP_ITEMS := [
	{"id": "armour", "name": "Body Armour", "price": 800},
	{"id": "health", "name": "Medkit", "price": 350},
	{"id": "ammo_pistol", "name": "Pistol Rounds", "price": 200},
	{"id": "ammo_smg", "name": "SMG Rounds", "price": 450},
	{"id": "ammo_rifle", "name": "Rifle Rounds", "price": 650},
	{"id": "ammo_grenade", "name": "Grenades", "price": 1200},
	{"id": "engine", "name": "Engine Tune", "price": 5500},
	{"id": "brakes", "name": "Sport Brakes", "price": 3200},
	{"id": "garage", "name": "Hillside Garage", "price": 18000},
	{"id": "penthouse", "name": "Downtown Penthouse", "price": 32000},
]

func setup(p_player: PlayerController, p_bus: EventBus) -> void:
	player = p_player
	bus = p_bus

func can_afford(id: String) -> bool:
	var item := item_by_id(id)
	return item != null and player != null and player.money >= int(item["price"])

func item_by_id(id: String) -> Dictionary:
	for i in SHOP_ITEMS:
		if String(i["id"]) == id:
			return i
	return {}

func buy(id: String, weapons: WeaponSystem) -> bool:
	var item := item_by_id(id)
	if item.is_empty() or player == null:
		return false
	if not player.spend(int(item["price"])):
		if bus != null:
			bus.toast.emit("Not enough credits")
		return false
	match id:
		"armour":
			player.add_armour(100.0)
		"health":
			player.heal(100.0)
		"ammo_pistol", "ammo_smg", "ammo_rifle", "ammo_grenade":
			var key := id.substr(5)
			weapons.add_ammo(key, 30 if key != "grenade" else 4)
		"engine", "brakes":
			upgrades[id] = int(upgrades.get(id, 0)) + 1
		"garage", "penthouse":
			properties.append(id)
	if bus != null:
		bus.toast.emit("Purchased: %s" % String(item["name"]))
	return true

func buy_vehicle(index: int) -> bool:
	var spec := GameData.vehicle(index)
	var price := int(spec["price"])
	if price <= 0 or player == null or not player.spend(price):
		return false
	owned_vehicles.append(index)
	return true

func tick(delta: float) -> void:
	if properties.is_empty():
		return
	_income_timer += delta
	if _income_timer > 60.0:
		_income_timer -= 60.0
		var income := properties.size() * 120
		player.add_money(income)
		if bus != null:
			bus.toast.emit("Property income +%d" % income)
