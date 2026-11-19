# Nova Mira — Game Design Document (v0.1)

**Pitch:** A young courier arrives in the coastal city of Nova Mira with a stolen
engine block and one chance to climb the local underworld. Drive, fight, take jobs,
outrun the police and own the night.

- **Genre:** open-world action-crime, third person, stylised-realistic.
- **Platform:** Android 8.0+ (ARM64), touch first, gamepad friendly.
- **World:** 2 x 2 km grid, six districts: Downtown, Waterfront & Port, Hillside
  Villas, Old Quarter, Industrial, Desert Outskirts. One seamless coordinate space.
- **Loop:** accept job → travel → complete objective → escape wanted level → spend
  money on weapons/ride/properties → unlock next story job.
- **Pillars:** (1) the city is a playground, (2) every system feeds the chase,
  (3) readable on a phone screen at 30 fps.

## Systems summary

| System | Design |
| --- | --- |
| Traversal | Third-person run/jump/drive; 10 vehicles with wheel physics, surfaces affect grip |
| Combat | 8 weapons, hitscan + grenade projectile, recoil/spread, aim assist, health + armour |
| Police | 5 wanted stars, pedestrian officers → cruisers → roadblocks → armoured units → helicopter |
| City | Procedural modular buildings, road graph, traffic lights, day/night, 5 weather states |
| Economy | Wallet, 4 shops, upgrades, property income, garaged vehicles |
| Missions | 5 story missions + 4 repeatable side activities, checkpointed, JSON save |
| UI | Arabic/English, RTL, main menu with live 3D city, HUD, minimap, phone, weapon wheel |
| Audio | Procedural SFX, 3 original radio stations, day/night ambience, mixer groups |

## Controlled scope

The full brief describes a multi-year AAA product. v0.1 targets a coherent, playable,
**actually buildable** prototype that demonstrates every core pillar, with explicit
gaps recorded in `KNOWN_LIMITATIONS.md`.
