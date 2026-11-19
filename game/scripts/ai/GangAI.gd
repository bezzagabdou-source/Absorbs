class_name GangAI
extends RefCounted
## Two gangs with home territories and simple hostility rules.

const TERRITORIES := [Vector3(450, 0, 350), Vector3(-450, 0, -350)]
var members: Array[PedestrianAI] = []
var reputation: Array[int] = [0, 0]

func territory_of(pos: Vector3) -> int:
	var a := pos.distance_to(TERRITORIES[0])
	var b := pos.distance_to(TERRITORIES[1])
	if a < 180.0 and a < b:
		return 0
	if b < 180.0:
		return 1
	return -1

func react_to(pos: Vector3) -> String:
	var t := territory_of(pos)
	if t < 0:
		return "neutral"
	return "watched"
