class_name EventBus
extends Node
## Decoupled global signal hub. Systems never reach into each other's nodes.

signal wanted_changed(stars: int)
signal money_changed(amount: int)
signal health_changed(hp: float, armour: float)
signal weapon_changed(name: String, ammo: int, reserve: int)
signal mission_changed(title: String, objective: String)
signal mission_completed(title: String, reward: int)
signal toast(text: String)
signal vehicle_state_changed(in_vehicle: bool)
signal weather_changed(weather: int)
signal time_changed(hour: float)
signal locale_changed(code: String)
signal settings_changed
signal player_died
signal player_arrested
signal radio_changed(station: String)
signal fps_updated(fps: float)
signal quality_changed(tier: Dictionary)
signal slot_changed(slot: int)
signal benchmark_finished(result: Dictionary)
signal effect_toggled(name: String, enabled: bool)
