// APEX VELOCITY — cinematic post stack.
// Runs on a full-screen ColorRect over the 3D SubViewport texture.
// Adds: filmic grade, vignette, chromatic aberration, subtle bloom bleed,
// film grain and a lens flare streak that fires when looking at the sun.
// Every term is tunable so the same shader covers night city, desert noon,
// rain and snow.
shader_type canvas_item;

uniform sampler2D scene_tex : hint_screen_texture, filter_linear_mipmap;
uniform float exposure : hint_range(0.2, 3.0) = 1.0;
uniform float contrast : hint_range(0.5, 2.0) = 1.08;
uniform float saturation : hint_range(0.0, 2.5) = 1.12;
uniform vec3 lift : source_color = vec3(0.0, 0.005, 0.012);
uniform vec3 gain : source_color = vec3(1.02, 1.0, 1.0);
uniform float vignette : hint_range(0.0, 2.0) = 0.38;
uniform float vignette_power = 2.2;
uniform float aberration : hint_range(0.0, 1.0) = 0.18;
uniform float grain : hint_range(0.0, 0.5) = 0.028;
uniform float bloom_bleed : hint_range(0.0, 1.0) = 0.12;
uniform float flare_strength : hint_range(0.0, 2.0) = 0.0;
uniform vec2 flare_pos = vec2(0.5, 0.35);
uniform vec3 flare_color : source_color = vec3(1.0, 0.72, 0.42);
uniform float speed_zoom : hint_range(0.0, 0.2) = 0.0;
uniform float damage_flash : hint_range(0.0, 1.0) = 0.0;
uniform vec3 damage_color : source_color = vec3(1.0, 0.09, 0.14);
uniform float night_mode : hint_range(0.0, 1.0) = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	// radial speed zoom: the frame pushes outward with velocity
	if (speed_zoom > 0.0) {
		vec2 c = uv - vec2(0.5);
		float r = length(c);
		uv = vec2(0.5) + c * (1.0 - speed_zoom * r * r);
	}

	// chromatic aberration grows toward the frame edge
	vec2 dir = uv - vec2(0.5);
	float edge = dot(dir, dir);
	float ab = aberration * 0.004 * (0.25 + edge * 3.0);
	vec3 col;
	col.r = texture(scene_tex, uv - dir * ab).r;
	col.g = texture(scene_tex, uv).g;
	col.b = texture(scene_tex, uv + dir * ab).b;

	// gentle bloom bleed via a small 4-tap blur of bright areas
	if (bloom_bleed > 0.0) {
		vec2 px = (1.0 / vec2(textureSize(scene_tex, 0))) * 6.0;
		vec3 b = texture(scene_tex, uv + vec2(px.x, 0.0)).rgb;
		b += texture(scene_tex, uv - vec2(px.x, 0.0)).rgb;
		b += texture(scene_tex, uv + vec2(0.0, px.y)).rgb;
		b += texture(scene_tex, uv - vec2(0.0, px.y)).rgb;
		b *= 0.25;
		vec3 bright = max(b - vec3(0.72), vec3(0.0));
		col += bright * bloom_bleed * 1.6;
	}

	col *= exposure;
	// filmic contrast around mid grey
	col = (col - 0.5) * contrast + 0.5;
	// lift / gain grade
	col = col * gain + lift;

	// saturation
	float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(luma), col, saturation);

	// cool shadows / warm highlights split tone
	col += vec3(-0.012, -0.004, 0.020) * (1.0 - smoothstep(0.0, 0.55, luma));
	col += vec3(0.016, 0.008, -0.008) * smoothstep(0.45, 1.0, luma);
	col = mix(col, col * vec3(0.94, 0.98, 1.10), night_mode * 0.45);

	// vignette
	float v = smoothstep(0.85, 0.15, length(dir) * 1.35);
	col *= mix(1.0, v, vignette * 0.5 + 0.5) * (1.0 - vignette * 0.18);

	// anamorphic flare streak through the sun position
	if (flare_strength > 0.0) {
		vec2 fp = (uv - flare_pos) * vec2(1.0, 6.5);
		float streak = exp(-dot(fp, fp) * 90.0);
		float core = exp(-dot(uv - flare_pos, uv - flare_pos) * 9000.0);
		col += flare_color * (streak * 0.35 + core * 0.9) * flare_strength;
	}

	// impact flash
	col = mix(col, damage_color * (0.35 + luma), damage_flash * 0.55);

	// filmic tonemap (ACES approximation) keeps highlights from clipping
	col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

	// film grain
	float g = hash(uv * vec2(1920.0, 1080.0) + fract(TIME) * 91.7) - 0.5;
	col += g * grain;

	COLOR = vec4(col, 1.0);
}
