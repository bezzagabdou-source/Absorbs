extends "res://scripts/ui/ScreenBase.gd"
## Credits / legal screen: asset attribution, engine + font licenses and the
## build version. Every third-party asset used by the game is listed here.

const ENTRIES := [
	["ENGINE", "Godot Engine 4.4 — MIT License — godotengine.org"],
	["FONTS", "Orbitron, Rajdhani, Exo 2 — SIL Open Font License 1.1 — Google Fonts"],
	["ICONS + MENU ART", "Apex Velocity asset pipeline (tools/generate_assets.py) — original work, CC0"],
	["TEXTURES", "Procedurally generated asphalt / concrete / carbon / decals — original work, CC0"],
	["AUDIO", "Procedurally synthesised SFX, engine loops and music — original work, CC0"],
	["TRACK GEOMETRY", "Procedurally generated at runtime — original work, CC0"],
	["PALETTE + UI", "Original design system (UIStyle.gd)"],
]

func build() -> void:
	top_bar(Localization.t("menu.credits"), true, false)
	var panel = UIStyle.make_glass_panel(28, Color(0.04, 0.06, 0.11, 0.86), 32, 0.2)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 96
	panel.offset_right = -96
	panel.offset_top = 168
	panel.offset_bottom = -60
	content.add_child(panel)
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	var v = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 14)
	scroll.add_child(v)
	var ttl = UIStyle.make_title("APEX VELOCITY", 56, UIStyle.CYAN)
	ttl.autowrap_mode = TextServer.AUTOWRAP_OFF
	ttl.clip_text = true
	v.add_child(ttl)
	v.add_child(UIStyle.make_kicker("VERSION " + str(ProjectSettings.get_setting("application/config/version", "1.0.0")),
		UIStyle.TEXT_DIM, 16))
	v.add_child(UIStyle.make_rule())
	for e in ENTRIES:
		var row = VBoxContainer.new()
		row.add_theme_constant_override("separation", -4)
		row.add_child(UIStyle.make_kicker(str(e[0]), UIStyle.CYAN, 15))
		var el = UIStyle.make_label(str(e[1]), "body", 22, Color.WHITE)
		el.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.add_child(el)
		v.add_child(row)
	v.add_child(UIStyle.make_rule())
	var foot = UIStyle.make_label(
		"All assets are either original works released under CC0 or third-party works used under " \
		+ "their respective licenses listed above. No copyrighted car brands, logos or music are used; " \
		+ "every vehicle, track and audio cue is fictional and procedurally generated.",
		"body", 20, UIStyle.TEXT_DIM)
	foot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(foot)
