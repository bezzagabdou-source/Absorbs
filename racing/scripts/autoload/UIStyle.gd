extends Node
## Design system for APEX VELOCITY: palette, typography, glass/neon primitives,
## icon library, shader backdrops and widget factories. Autoloaded as `UIStyle`.

const INK := Color("05070f")
const INK_2 := Color("0a0f1e")
const GLASS := Color(0.07, 0.10, 0.18, 0.72)
const TEXT := Color("eaf2ff")
const TEXT_DIM := Color("93a4c4")
const CYAN := Color("22e9ff")
const MAGENTA := Color("ff2e93")
const VIOLET := Color("7c4dff")
const AMBER := Color("ffb020")
const LIME := Color("65ffaa")
const RED := Color("ff3b4e")
const GOLD := Color("ffc84d")
const R := 26

const AURORA_SHADER := """
shader_type canvas_item;
uniform vec4 c_a : source_color = vec4(0.13,0.91,1.0,1.0);
uniform vec4 c_b : source_color = vec4(1.0,0.18,0.58,1.0);
uniform vec4 c_c : source_color = vec4(0.49,0.30,1.0,1.0);
uniform float speed = 0.05;
uniform float intensity = 0.35;
uniform float grain = 0.03;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0; float a = 0.55;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}
void fragment() {
    vec2 uv = UV;
    float t = TIME * speed;
    float n1 = fbm(uv * vec2(2.2, 1.4) + vec2(t, -t * 0.6));
    float n2 = fbm(uv * vec2(1.3, 2.4) - vec2(t * 0.8, t));
    float n3 = fbm(uv * vec2(3.1, 1.1) + vec2(-t * 0.5, t * 0.9));
    vec3 col = vec3(0.012, 0.016, 0.035);
    col += c_a.rgb * pow(n1, 2.2) * intensity * 1.3;
    col += c_b.rgb * pow(n2, 2.6) * intensity;
    col += c_c.rgb * pow(n3, 2.4) * intensity * 0.8;
    vec2 d = uv - 0.5;
    col *= 1.0 - dot(d, d) * 1.6;
    col += (hash(uv * 1000.0 + TIME) - 0.5) * grain;
    COLOR = vec4(col, 1.0);
}
"""

const RAIN_SHADER := """
shader_type canvas_item;
uniform float speed = 0.55;
uniform float density = 0.5;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 24634.6345); }
void fragment() {
    vec2 uv = UV;
    float col_id = floor(uv.x * 140.0);
    float rnd = hash(vec2(col_id, 7.0));
    if (rnd > density) { COLOR = vec4(0.0); }
    else {
        float y = fract(uv.y * 2.0 + TIME * speed * (0.6 + rnd) + rnd * 10.0);
        float streak = smoothstep(0.0, 0.06, y) * smoothstep(0.2, 0.10, y);
        float x = fract(uv.x * 140.0);
        float thin = smoothstep(0.55, 0.5, abs(x - 0.5)) * 0.9;
        COLOR = vec4(vec3(0.72, 0.85, 1.0), streak * thin * 0.55);
    }
}
"""

const SPEED_SHADER := """
shader_type canvas_item;
uniform float intensity = 0.0;
uniform vec2 center = vec2(0.5, 0.5);
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void fragment() {
    vec2 uv = UV - center;
    float dist = length(uv);
    float ang = atan(uv.y, uv.x);
    float rays = hash(vec2(floor(ang * 34.0), 1.0));
    float mask = smoothstep(0.22, 0.85, dist) * rays;
    COLOR = vec4(vec3(0.85, 0.95, 1.0), mask * intensity * 0.45);
}
"""

const VIGNETTE_SHADER := """
shader_type canvas_item;
uniform vec4 tint : source_color = vec4(0.02,0.03,0.07,1.0);
uniform float strength = 0.85;
void fragment() {
    vec2 uv = UV - 0.5;
    float d = length(uv * vec2(1.15, 1.0));
    float v = smoothstep(0.32, 0.78, d) * strength;
    COLOR = vec4(tint.rgb, v);
}
"""

var display_font: FontVariation
var body_font: FontVariation
var body_bold: FontVariation
var numeric_font: FontVariation
var kicker_font: FontVariation
var arabic_font: SystemFont
var arabic_bold: FontVariation
var theme: Theme

var _tex_cache: Dictionary = {}
var _icon_cache: Dictionary = {}
var _art_cache: Dictionary = {}


func _ready() -> void:
	_build_fonts()
	_build_theme()


func _build_fonts() -> void:
	var orbitron: FontFile = _safe_load("res://assets/fonts/Orbitron-Variable.ttf")
	var rajdhani: FontFile = _safe_load("res://assets/fonts/Rajdhani-SemiBold.ttf")
	var rajdhani_r: FontFile = _safe_load("res://assets/fonts/Rajdhani-Medium.ttf")
	var rajdhani_b: FontFile = _safe_load("res://assets/fonts/Rajdhani-Bold.ttf")
	display_font = FontVariation.new()
	if orbitron:
		display_font.base_font = orbitron
		display_font.variation_opentype = {"wght": 760}
		display_font.spacing_glyph = 2
		kicker_font = FontVariation.new()
		kicker_font.base_font = orbitron
		kicker_font.variation_opentype = {"wght": 500}
		kicker_font.spacing_glyph = 6
	else:
		display_font.base_font = ThemeDB.fallback_font
		kicker_font = display_font
	body_font = FontVariation.new()
	body_bold = FontVariation.new()
	numeric_font = FontVariation.new()
	if rajdhani_r:
		body_font.base_font = rajdhani_r
		body_bold.base_font = rajdhani
		numeric_font.base_font = rajdhani_b
		numeric_font.spacing_glyph = 1
	else:
		body_font.base_font = ThemeDB.fallback_font
		body_bold.base_font = ThemeDB.fallback_font
		numeric_font.base_font = ThemeDB.fallback_font
	arabic_font = SystemFont.new()
	arabic_font.font_names = PackedStringArray(["Noto Sans Arabic", "Noto Naskh Arabic", "DejaVu Sans"])
	arabic_bold = FontVariation.new()
	arabic_bold.base_font = arabic_font
	arabic_bold.variation_embolden = 0.6


func _safe_load(path: String) -> FontFile:
	if ResourceLoader.exists(path):
		return load(path)
	return null


func make_numeral(text: String, size: int = 42, color: Color = TEXT,
		align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	## Title-sized numerals. Orbitron's slashed zero looks like a missing glyph,
	## so numbers always use the Rajdhani numeric face.
	return make_label(text, "numeric", size, color, align)


func font_for(kind: String = "body") -> Font:
	if Localization.is_rtl():
		return arabic_bold if kind in ["display", "kicker", "bold"] else arabic_font
	match kind:
		"display":
			return display_font
		"kicker":
			return kicker_font
		"bold":
			return body_bold
		"numeric":
			return numeric_font
		_:
			return body_font


func _build_theme() -> void:
	theme = Theme.new()
	theme.default_font = body_font
	theme.default_font_size = 26
	theme.set_font("font", "Label", body_font)
	theme.set_color("font_color", "Label", TEXT)
	theme.set_stylebox("panel", "PanelContainer", glass_box(R))
	theme.set_stylebox("panel", "Panel", glass_box(R))
	theme.set_color("font_color", "Button", TEXT)
	theme.set_font("font", "Button", body_bold)
	theme.set_font_size("font_size", "Button", 28)
	theme.set_stylebox("normal", "Button", accent_box(CYAN, 0.10, 18))
	theme.set_stylebox("hover", "Button", accent_box(CYAN, 0.22, 18))
	theme.set_stylebox("pressed", "Button", accent_box(CYAN, 0.34, 18))
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_stylebox("scroll", "VScrollBar", flat_box(Color(0.1, 0.13, 0.2, 0.5), 8))
	theme.set_stylebox("grabber", "VScrollBar", flat_box(Color(0.35, 0.85, 1.0, 0.65), 8))
	theme.set_stylebox("grabber_highlight", "VScrollBar", flat_box(Color(0.5, 0.95, 1.0, 0.9), 8))
	theme.set_stylebox("grabber_pressed", "VScrollBar", flat_box(CYAN, 8))
	theme.set_stylebox("slider", "HSlider", flat_box(Color(0.12, 0.16, 0.26, 0.9), 8, 6))
	theme.set_stylebox("grabber_area", "HSlider", flat_box(CYAN, 8, 6))
	theme.set_stylebox("grabber_area_highlight", "HSlider", flat_box(CYAN.lightened(0.2), 8, 6))
	theme.set_icon("grabber", "HSlider", circle_icon(26, Color.WHITE))
	theme.set_stylebox("panel", "PopupMenu", glass_box(14))
	theme.set_color("font_color", "PopupMenu", TEXT)


func flat_box(color: Color, radius: int = R, border: int = 0, border_color: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var sb = StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.set_border_width_all(border)
	sb.border_color = border_color
	sb.anti_aliasing = true
	return sb


func glass_box(radius: int = R, tint: Color = GLASS, border_alpha: float = 0.16, glow: float = 0.0) -> StyleBoxFlat:
	var sb = StyleBoxFlat.new()
	sb.bg_color = tint
	sb.set_corner_radius_all(radius)
	sb.set_border_width_all(1)
	sb.border_color = Color(0.75, 0.92, 1.0, border_alpha)
	sb.anti_aliasing = true
	sb.content_margin_left = 26
	sb.content_margin_right = 26
	sb.content_margin_top = 22
	sb.content_margin_bottom = 22
	if glow > 0.0:
		sb.shadow_color = Color(0.13, 0.85, 1.0, glow)
		sb.shadow_size = 18
	return sb


func accent_box(accent: Color, fill: float, radius: int = 18, glow: float = 0.0) -> StyleBoxFlat:
	var sb = StyleBoxFlat.new()
	sb.bg_color = Color(accent.r, accent.g, accent.b, fill)
	sb.border_color = Color(accent.r, accent.g, accent.b, 0.65)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(radius)
	sb.anti_aliasing = true
	sb.content_margin_left = 26
	sb.content_margin_right = 26
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	if glow > 0.0:
		sb.shadow_color = Color(accent.r, accent.g, accent.b, glow)
		sb.shadow_size = 22
	return sb


func gradient_tex(top: Color, bottom: Color, radius: int = R, size: int = 96) -> ImageTexture:
	var key = "g:%s:%s:%d:%d" % [top.to_html(), bottom.to_html(), radius, size]
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img = Image.create(size, size, false, Image.FORMAT_RGBA8)
	var r = float(radius)
	for y in range(size):
		var t = float(y) / float(size - 1)
		var c = top.lerp(bottom, t)
		for x in range(size):
			var a = 1.0
			var dx = 0.0
			var dy = 0.0
			if x < radius:
				dx = r - float(x)
			elif x >= size - radius:
				dx = float(x) - float(size - radius - 1)
			if y < radius:
				dy = r - float(y)
			elif y >= size - radius:
				dy = float(y) - float(size - radius - 1)
			if dx > 0.0 and dy > 0.0:
				var d = sqrt(dx * dx + dy * dy)
				a = clampf(r - d + 0.5, 0.0, 1.0)
			img.set_pixel(x, y, Color(c.r, c.g, c.b, c.a * a))
	var tex = ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex


func gradient_box(top: Color, bottom: Color, radius: int = R) -> StyleBoxTexture:
	var sb = StyleBoxTexture.new()
	sb.texture = gradient_tex(top, bottom, radius)
	var m = radius + 2
	sb.texture_margin_left = m
	sb.texture_margin_right = m
	sb.texture_margin_top = m
	sb.texture_margin_bottom = m
	sb.content_margin_left = 26
	sb.content_margin_right = 26
	sb.content_margin_top = 22
	sb.content_margin_bottom = 22
	return sb


func glow_tex(color: Color, size: int = 128) -> ImageTexture:
	var key = "glow:%s:%d" % [color.to_html(), size]
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img = Image.create(size, size, false, Image.FORMAT_RGBA8)
	var half = size * 0.5
	for y in range(size):
		for x in range(size):
			var d = Vector2(x - half, y - half).length() / half
			var a = pow(clampf(1.0 - d, 0.0, 1.0), 3.0)
			img.set_pixel(x, y, Color(color.r, color.g, color.b, a * color.a))
	var tex = ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex


func circle_icon(size: int, color: Color) -> ImageTexture:
	var key = "circle:%d:%s" % [size, color.to_html()]
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img = Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c = (size - 1) / 2.0
	for y in range(size):
		for x in range(size):
			var d = Vector2(x - c, y - c).length()
			var a = clampf(c - d + 0.5, 0.0, 1.0)
			img.set_pixel(x, y, Color(color.r, color.g, color.b, a * color.a))
	var tex = ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex


func rounded_tex(fill: Color, radius: int = R, border: Color = Color.TRANSPARENT, border_px: int = 2, size: int = 96) -> ImageTexture:
	var key = "round:%s:%d:%s:%d:%d" % [fill.to_html(), radius, border.to_html(), border_px, size]
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img = Image.create(size, size, false, Image.FORMAT_RGBA8)
	var r = float(radius)
	for y in range(size):
		for x in range(size):
			var dx = 0.0
			var dy = 0.0
			if x < radius:
				dx = r - float(x)
			elif x >= size - radius:
				dx = float(x) - float(size - radius - 1)
			if y < radius:
				dy = r - float(y)
			elif y >= size - radius:
				dy = float(y) - float(size - radius - 1)
			var d = sqrt(dx * dx + dy * dy) if (dx > 0.0 and dy > 0.0) else 0.0
			var a = clampf(r - d + 0.5, 0.0, 1.0) if d > 0.0 else 1.0
			var col = fill
			if border_px > 0 and border.a > 0.0 and d > maxf(0.0, r - float(border_px)):
				col = border
			img.set_pixel(x, y, Color(col.r, col.g, col.b, col.a * a))
	var tex = ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex


func icon(name: String) -> Texture2D:
	if _icon_cache.has(name):
		return _icon_cache[name]
	var path = "res://assets/icon/%s.png" % name
	var tex: Texture2D = null
	if ResourceLoader.exists(path):
		tex = load(path)
	if tex == null:
		tex = circle_icon(64, Color.WHITE)
	_icon_cache[name] = tex
	return tex


func art(name: String) -> Texture2D:
	if _art_cache.has(name):
		return _art_cache[name]
	# Art is authored as PNG but the shipped sheets were pre-converted to WebP to
	# keep the APK small. Accept either, plus the legacy track_<name> prefix, so a
	# brand-new illustration works the moment it lands in assets/art.
	var tex: Texture2D = null
	for suffix in [".webp", ".png", ".jpg"]:
		for prefix in ["", "track_"]:
			var path: String = "res://assets/art/%s%s%s" % [prefix, name, suffix]
			if ResourceLoader.exists(path):
				tex = load(path)
				break
		if tex != null:
			break
	_art_cache[name] = tex
	return tex


func class_color(cls: String) -> Color:
	return GameData.CLASS_INFO.get(cls, {}).get("color", CYAN)


func make_label(text: String, kind: String = "body", size: int = 26, color: Color = TEXT,
		align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l = Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.add_theme_font_override("font", font_for(kind))
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func make_title(text: String, size: int = 64, accent: Color = CYAN,
		align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l = make_label(text, "display", size, Color.WHITE, align)
	var ls = LabelSettings.new()
	ls.font = font_for("display")
	ls.font_size = size
	ls.font_color = Color.WHITE
	ls.shadow_size = int(size * 0.34)
	ls.shadow_color = Color(accent.r, accent.g, accent.b, 0.55)
	ls.shadow_offset = Vector2.ZERO
	ls.outline_size = maxi(1, int(size * 0.03))
	ls.outline_color = Color(accent.r * 0.22, accent.g * 0.22, accent.b * 0.28, 0.9)
	l.label_settings = ls
	return l


func make_kicker(text: String, accent: Color = CYAN, size: int = 20) -> Label:
	var l = make_label(text.to_upper(), "kicker", size, accent)
	l.add_theme_constant_override("shadow_outline_size", 8)
	l.add_theme_color_override("font_shadow_color", Color(accent.r, accent.g, accent.b, 0.45))
	return l


func _has_digits(text: String) -> bool:
	for i in range(text.length()):
		var code = text.unicode_at(i)
		if code >= 48 and code <= 57:
			return true
	return false


func make_button(text: String, accent: Color = CYAN, primary: bool = false,
		font_size: int = 28, height: float = 78.0) -> Button:
	var b = Button.new()
	b.text = text if Localization.is_rtl() else text.to_upper()
	b.custom_minimum_size = Vector2(0, height)
	b.focus_mode = Control.FOCUS_NONE
	# Orbitron draws zero with a slash that reads as a missing glyph at small
	# sizes, so numeric captions ("0.6", "1.0", "LV 2") use the numeric face.
	b.add_theme_font_override("font", font_for("numeric" if _has_digits(text) else "display"))
	b.add_theme_font_size_override("font_size", font_size)
	b.add_theme_color_override("font_color", Color.WHITE if primary else Color(0.88, 0.94, 1.0))
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(0.45, 0.5, 0.62, 0.7))
	if primary:
		b.add_theme_stylebox_override("normal", accent_box(accent, 0.28, 20, 0.30))
		b.add_theme_stylebox_override("hover", accent_box(accent, 0.44, 20, 0.55))
		b.add_theme_stylebox_override("pressed", accent_box(accent, 0.62, 20, 0.75))
	else:
		b.add_theme_stylebox_override("normal", glass_box(20, Color(0.09, 0.13, 0.22, 0.66), 0.22, 0.0))
		b.add_theme_stylebox_override("hover", glass_box(20, Color(0.13, 0.2, 0.34, 0.8), 0.4, 0.25))
		b.add_theme_stylebox_override("pressed", accent_box(accent, 0.35, 20, 0.4))
	b.add_theme_stylebox_override("disabled", glass_box(20, Color(0.05, 0.07, 0.12, 0.5), 0.08, 0.0))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.pivot_offset = Vector2(0, height * 0.5)
	b.mouse_entered.connect(_on_hover.bind(b, 1.035))
	b.mouse_exited.connect(_on_hover.bind(b, 1.0))
	b.button_down.connect(_on_press.bind(b))
	b.button_up.connect(_on_release.bind(b))
	b.pressed.connect(_on_click)
	return b


func _on_hover(b: Button, scale: float) -> void:
	var tw = b.create_tween()
	tw.tween_property(b, "scale", Vector2(scale, scale), 0.14).set_ease(Tween.EASE_OUT)


func _on_press(b: Button) -> void:
	var tw = b.create_tween()
	tw.tween_property(b, "scale", Vector2(0.965, 0.965), 0.07).set_ease(Tween.EASE_OUT)


func _on_release(b: Button) -> void:
	var tw = b.create_tween()
	tw.tween_property(b, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _on_click() -> void:
	AudioDirector.play_sfx("ui_click", -4.0)


func make_icon_button(icon_name: String, size: float = 84.0, accent: Color = CYAN,
		text: String = "") -> Button:
	var b = Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(size, size)
	b.text = text
	b.add_theme_font_override("font", font_for("display"))
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_stylebox_override("normal", glass_box(int(size * 0.32), Color(0.08, 0.11, 0.2, 0.7), 0.25, 0.1))
	var hover = glass_box(int(size * 0.32), Color(0.14, 0.22, 0.36, 0.9), 0.5, 0.35)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", accent_box(accent, 0.4, int(size * 0.32), 0.45))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var icon_rect = TextureRect.new()
	icon_rect.texture = icon(icon_name)
	icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon_rect.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	icon_rect.size = Vector2(size * 0.46, size * 0.46)
	icon_rect.position = Vector2(-size * 0.23, -size * 0.23)
	icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_rect.modulate = Color(accent.r, accent.g, accent.b, 0.95)
	b.add_child(icon_rect)
	b.pivot_offset = Vector2(size * 0.5, size * 0.5)
	b.button_down.connect(_on_press.bind(b))
	b.button_up.connect(_on_release.bind(b))
	b.pressed.connect(_on_click)
	return b


func make_glass_panel(radius: int = R, tint: Color = GLASS, padding: int = 26,
		glow: float = 0.0) -> PanelContainer:
	var p = PanelContainer.new()
	var sb = glass_box(radius, tint, 0.18, glow)
	sb.content_margin_left = padding
	sb.content_margin_right = padding
	sb.content_margin_top = padding
	sb.content_margin_bottom = padding
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	return p


func make_gradient_panel(top: Color, bottom: Color, radius: int = R, padding: int = 26) -> PanelContainer:
	var p = PanelContainer.new()
	var sb = gradient_box(top, bottom, radius)
	sb.content_margin_left = padding
	sb.content_margin_right = padding
	sb.content_margin_top = padding
	sb.content_margin_bottom = padding
	p.add_theme_stylebox_override("panel", sb)
	return p


func make_chip(text: String, accent: Color = CYAN, size: int = 20) -> PanelContainer:
	## Chips often carry counts, so they use the numeric face (no slashed zero).
	var p = PanelContainer.new()
	var sb = flat_box(Color(accent.r, accent.g, accent.b, 0.16), size, 1, Color(accent.r, accent.g, accent.b, 0.55))
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	p.add_theme_stylebox_override("panel", sb)
	p.add_child(make_label(text, "numeric", size, accent))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func make_stat_bar(label_text: String, value: float, accent: Color = CYAN,
		segments: int = 10, width: float = 300.0, show_value: bool = true) -> Control:
	var root = VBoxContainer.new()
	root.add_theme_constant_override("separation", 6)
	root.custom_minimum_size = Vector2(width, 0)
	var top = HBoxContainer.new()
	var lbl = make_label(label_text, "kicker", 17, TEXT_DIM)
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(lbl)
	if show_value:
		top.add_child(make_label(str(int(round(value))), "numeric", 20, accent))
	root.add_child(top)
	var bar = HBoxContainer.new()
	bar.add_theme_constant_override("separation", 4)
	var filled = int(round(clampf(value, 0.0, 100.0) / 100.0 * float(segments)))
	for i in range(segments):
		var seg = ColorRect.new()
		seg.custom_minimum_size = Vector2(0, 8)
		seg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		seg.color = Color(accent.r, accent.g, accent.b, 0.95) if i < filled else Color(1, 1, 1, 0.07)
		seg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		bar.add_child(seg)
	root.add_child(bar)
	return root


func make_progress_bar(value: float, accent: Color = CYAN, height: float = 10.0) -> ProgressBar:
	var pb = ProgressBar.new()
	pb.min_value = 0
	pb.max_value = 100
	pb.value = clampf(value, 0, 100)
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(0, height)
	pb.add_theme_stylebox_override("background", flat_box(Color(1, 1, 1, 0.08), int(height)))
	pb.add_theme_stylebox_override("fill", flat_box(accent, int(height)))
	pb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return pb


func make_toggle(initial: bool, accent: Color = CYAN) -> CheckButton:
	var cb = CheckButton.new()
	cb.button_pressed = initial
	cb.focus_mode = Control.FOCUS_NONE
	cb.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	cb.add_theme_stylebox_override("hover", StyleBoxEmpty.new())
	cb.add_theme_stylebox_override("pressed", StyleBoxEmpty.new())
	cb.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	cb.add_theme_icon_override("checked", rounded_tex(Color(accent.r, accent.g, accent.b, 0.95), 22, Color.WHITE, 2, 64))
	cb.add_theme_icon_override("unchecked", rounded_tex(Color(0.25, 0.3, 0.42, 0.8), 22, Color(1, 1, 1, 0.2), 2, 64))
	cb.toggled.connect(_on_toggle)
	return cb


func _on_toggle(_on: bool) -> void:
	AudioDirector.play_sfx("ui_click", -6.0)


func make_art_background(art_name: String) -> Control:
	var holder = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rect = TextureRect.new()
	rect.texture = art(art_name)
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(rect)
	var scrim = ColorRect.new()
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.02, 0.04, 0.66)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(scrim)
	var grad = TextureRect.new()
	grad.texture = gradient_tex(Color(0.01, 0.015, 0.03, 0.0), Color(0.01, 0.012, 0.025, 0.95), 8)
	grad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	grad.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	grad.stretch_mode = TextureRect.STRETCH_SCALE
	grad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(grad)
	return holder


func _shader_rect(code: String, params: Dictionary = {}) -> ColorRect:
	var c = ColorRect.new()
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat = ShaderMaterial.new()
	var sh = Shader.new()
	sh.code = code
	mat.shader = sh
	for k in params.keys():
		mat.set_shader_parameter(k, params[k])
	c.material = mat
	return c


func make_aurora(accent_a: Color = CYAN, accent_b: Color = MAGENTA, intensity: float = 0.35) -> ColorRect:
	return _shader_rect(AURORA_SHADER, {"c_a": accent_a, "c_b": accent_b, "c_c": VIOLET, "intensity": intensity})


func make_rain(density: float = 0.6, speed: float = 0.55) -> ColorRect:
	return _shader_rect(RAIN_SHADER, {"density": density, "speed": speed})


func make_vignette(strength: float = 0.85) -> ColorRect:
	return _shader_rect(VIGNETTE_SHADER, {"strength": strength})


func make_speedlines() -> ColorRect:
	return _shader_rect(SPEED_SHADER, {"intensity": 0.0})


func make_rule(accent: Color = Color(1, 1, 1, 0.12), height: float = 2.0) -> ColorRect:
	var r = ColorRect.new()
	r.color = accent
	r.custom_minimum_size = Vector2(0, height)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


func apply_rtl(root: Control) -> void:
	root.layout_direction = Control.LAYOUT_DIRECTION_RTL if Localization.is_rtl() else Control.LAYOUT_DIRECTION_LTR


## Region artwork for the title and menu backdrops. The four shipped pieces are
## the same world the game drives through, so the menu reads as part of the game
## rather than as a separate product.
const REGION_ART := [
	"menu_hero",
	"splash_alpine",
	"splash_desert",
	"splash_coast",
]


## A slow cross-fading backdrop: two layers, offset by one index, each fading in
## over a full beat. Cheap (two TextureRects and one tween) but it makes the title
## screen feel alive instead of static.
func make_crossfade_backdrop(names: Array, seconds: float = 7.0) -> Control:
	var holder = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.clip_contents = true
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var layers: Array[TextureRect] = []
	for i in 2:
		var rect = TextureRect.new()
		rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rect.modulate.a = 1.0 if i == 0 else 0.0
		holder.add_child(rect)
		layers.append(rect)
	layers[0].texture = art(str(names[0]))

	# a scrim so type stays legible over any of the pieces
	var scrim = ColorRect.new()
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.012, 0.016, 0.032, 0.58)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(scrim)

	var idx := 0
	var tween = holder.create_tween()
	tween.set_loops()
	for i in range(1, names.size() * 2):
		var front = layers[(i + 1) % 2]
		var under = layers[i % 2]
		var next_name = str(names[(idx + 1) % names.size()])
		tween.tween_callback(func() -> void:
			front.texture = art(next_name)
			front.modulate.a = 0.0)
		tween.tween_property(front, "modulate:a", 1.0, seconds * 0.35)
		tween.tween_interval(seconds * 0.5)
		tween.tween_property(front, "modulate:a", 0.0, seconds * 0.35)
		tween.tween_callback(func() -> void:
			under.texture = front.texture)
		idx += 1
	return holder
