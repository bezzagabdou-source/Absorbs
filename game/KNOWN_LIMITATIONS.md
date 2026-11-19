# Known limitations (honest, v0.1.0)

This is a real native Android game prototype, **not** a GTA-scale production. The
following requested features are absent or reduced; nothing was removed silently.

## Not implemented / reduced

1. **Unity/DOTS/Burst, HLSL/ShaderGraph, Kotlin native layer** — engine decision changed to Godot 4 (see `ENVIRONMENT_REPORT.md`); Godot's built-in renderer, GDScript and vehicle nodes are used instead. No C++ GDExtension.
2. **True 4 km² with fully detailed interiors** — the world grid is 2000 x 2000 m, but only the area around the player is built at full detail (chunk streaming); the full grid exists as a road graph and low-detail skyline.
3. **5 walkable interiors** — currently 5 interior *rooms* are reachable through doors, generated from one parametric room scene (shop, apartment, restaurant, garage, police station). They are small, not full buildings.
4. **Ragdoll** — hit reactions and ragdoll-like fall animation are procedural transforms on rigid bodies; no full skeletal ragdoll solver.
5. **Mesh deformation of vehicles** — damage changes material tint, emits smoke/fire, detaches simple parts and can explode; per-vertex crash deformation is not implemented.
6. **NavMesh baking at runtime** — pedestrians use a lightweight road/sidewalk waypoint graph with local avoidance instead of NavigationMesh.
7. **GPU Instancing / Occlusion Culling / SSR / SSAO** — frustum + distance culling and MultiMesh instancing are used; SSR/SSAO are not available in the mobile renderer used here.
8. **AI image-to-3D asset generation** — no local Blender, no image-to-3D model or API access; all geometry is original procedural primitives (documented in `ASSETS_LICENSES.md`).
9. **Cloud saves, Bluetooth controller remapping UI, drag-and-drop button layout** — Android local JSON save and fixed touch layout with configurable sensitivity only. Gamepad buttons are mapped where the engine reports them.
10. **Real-time ray-traced reflections / volumetric clouds** — stylised sky shader, fog, rain and emissive night lighting instead.
11. **Play Asset Delivery / 500 MB content** — the real APK is 26,058,026 bytes (~24.8 MiB). It is genuinely smaller than 500 MB because every asset is procedurally generated (12 synthesized WAVs ~0.7 MB, two OFL fonts ~0.5 MB, two generated PNGs, everything else runtime geometry). Padding with random data was explicitly rejected. Reaching 500 MB honestly would require several hours of CC0/CC-BY 3D art and music, high-resolution PBR texture sets, and many more authored interiors/missions.
12. **Automated on-device playtesting** — validation runs headlessly in CI (import, script parse, smoke tests, APK build, signature verification). No Android emulator/device is available in the sandbox; FPS figures from a real phone are therefore not claimed.

## Licence / repository note

The token available to this session cannot create private repositories. The source was
committed to the session branch of `bezzagabdou-source/Absorbs` and the release was
created there; moving it to a private repo requires repo-creation permission.
