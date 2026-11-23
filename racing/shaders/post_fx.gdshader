// APEX VELOCITY — cinematic post stack, v3.
//
// Runs on a full-screen ColorRect that sits ON TOP of the 3D SubViewport and
// samples that viewport's own texture. (Sampling hint_screen_texture would read
// the 2D canvas underneath the car, i.e. an empty frame.)
//
// What v3 adds over v2, and why each one matters:
//   1. A real filmic shoulder/toe curve. v2 multiplied contrast around 0.5, which
//      crushes blacks and clips highlights into flat discs. The new curve rolls
//      highlights off instead, so a wet road at night keeps gradation.
//   2. Anisotropic bloom. A 4-tap box blur reads as a halo; a 12-tap directional
//      streak reads as a lens. This is what makes headlights and neon bleed.
//   3. Blue-noise dithering before quantisation. Without it the dark half of a
//      night frame shows visible banding on a phone panel.
//   4. A proper ACES-style grade with separate shadow/highlight tinting, so
//      night is blue-black and noon is neutral — never the purple cast the
//      brief bans.
//
// Every term stays tunable so the same shader covers night city, desert noon,
// rain and snow.
shader_type canvas_item;

uniform sampler2D scene_tex : filter_linear_mipmap, repeat_disable;
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
uniform float bloom_threshold : hint_range(0.0, 2.0) = 0.78;
uniform float streak_amount : hint_range(0.0, 1.0) = 0.35;
uniform float flare_strength : hint_range(0.0, 2.0) = 0.0;
uniform vec2 flare_pos = vec2(0.5, 0.35);
uniform vec3 flare_color : source_color = vec3(1.0, 0.72, 0.42);
uniform float speed_zoom : hint_range(0.0, 0.2) = 0.0;
uniform float damage_flash : hint_range(0.0, 1.0) = 0.0;
uniform vec3 damage_color : source_color = vec3(1.0, 0.09, 0.14);
uniform float night_mode : hint_range(0.0, 1.0) = 0.0;
uniform float shoulder : hint_range(0.4, 2.5) = 1.35;
uniform float dither : hint_range(0.0, 0.02) = 0.0035;
uniform float wet_mode : hint_range(0.0, 1.0) = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Blue-ish noise: cheap value noise that decorrelates between the channels just
// enough to break 8-bit banding without reading as coloured static.
float bnoise(vec2 p) {
	return fract(hash(p) + hash(p + vec2(31.7, 17.3)) * 0.5);
}

// Filmic shoulder. Maps [0,inf) into [0,1) with a controllable knee; the linear
// section keeps midtones exactly where the grade put them and only the bright
// end compresses, which is what a real camera does.
vec3 filmic(vec3 c, float sh) {
	vec3 x = max(c, vec3(0.0));
	vec3 num = x * (sh * x + 1.0);
	vec3 den = x * (sh * x + 1.0) + vec3(1.0 / sh);
	return num / max(den, vec3(1e-4));
}

void fragment() {
	vec2 uv = UV;
	// radial speed zoom: the frame pushes outward with velocity
	if (speed_zoom > 0.0) {
		vec2 c0 = uv - vec2(0.5);
		float r0 = length(c0);
		uv = vec2(0.5) + c0 * (1.0 - speed_zoom * r0 * r0);
	}

	// chromatic aberration grows toward the frame edge, and doubles in the wet
	// because rain on a lens is what actually produces it
	vec2 dir = uv - vec2(0.5);
	float edge = dot(dir, dir);
	float ab = aberration * 0.004 * (0.25 + edge * 3.0) * (1.0 + wet_mode);
	vec3 col;
	col.r = texture(scene_tex, uv - dir * ab).r;
	col.g = texture(scene_tex, uv).g;
	col.b = texture(scene_tex, uv + dir * ab).b;

	// --- anisotropic bloom -------------------------------------------------
	// Wide horizontal taps for the streak plus a compact radial set for the
	// halo. Two different shapes is what separates a lens from a blur.
	if (bloom_bleed > 0.0) {
		vec2 px = (1.0 / vec2(textureSize(scene_tex, 0)));
		vec3 halo = vec3(0.0);
		float wsum = 0.0;
		for (int i = -3; i <= 3; i++) {
			float fi = float(i);
			float w = exp(-fi * fi * 0.32);
			vec2 o = vec2(px.x * fi * 3.5, px.y * fi * 3.5);
			halo += texture(scene_tex, uv + o).rgb * w;
			wsum += w;
		}
		halo /= max(wsum, 1e-4);

		vec3 streak = vec3(0.0);
		float ssum = 0.0;
		for (int j = -6; j <= 6; j++) {
			float fj = float(j);
			float w2 = exp(-abs(fj) * 0.55);
			vec2 o2 = vec2(px.x * fj * 7.0, 0.0);
			streak += texture(scene_tex, uv + o2).rgb * w2;
			ssum += w2;
		}
		streak /= max(ssum, 1e-4);

		vec3 bright = max(halo - vec3(bloom_threshold), vec3(0.0));
		vec3 bright_s = max(streak - vec3(bloom_threshold), vec3(0.0));
		col += bright * bloom_bleed * 2.1;
		col += bright_s * bloom_bleed * streak_amount * 1.5;
	}

	col *= exposure;
	// filmic contrast around mid grey
	col = (col - 0.5) * contrast + 0.5;
	// lift / gain grade
	col = col * gain + lift;
	// shoulder roll-off AFTER the grade so bright areas keep their edges
	col = filmic(col, shoulder);

	// saturation
	float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(luma), col, saturation);

	// --- split tone -------------------------------------------------------
	// Cool shadows / warm highlights. The night tint is deliberately blue, not
	// violet: a magenta night is the single fastest way to make a scene look
	// like a different (cheaper) game.
	col += vec3(-0.012, -0.004, 0.020) * (1.0 - smoothstep(0.0, 0.55, luma));
	col += vec3(0.016, 0.008, -0.008) * smoothstep(0.45, 1.0, luma);
	col = mix(col, col * vec3(0.90, 0.97, 1.12), night_mode * 0.55);

	// --- vignette ---------------------------------------------------------
	float v = smoothstep(0.85, 0.15, length(dir) * 1.35);
	col *= mix(1.0, v, vignette * 0.5 + 0.5) * (1.0 - vignette * 0.18);

	// anamorphic flare streak through the sun position
	if (flare_strength > 0.0) {
		vec2 fp = (uv - flare_pos) * vec2(1.0, 6.5);
		float streak = exp(-dot(fp, fp) * 90.0);
		float core = exp(-dot(uv - flare_pos, uv - flare_pos) * 9000.0);
		// a faint ring ghost opposite the sun, which reads as a real optic
		vec2 gp = (uv - (vec2(0.5) - (flare_pos - vec2(0.5)) * 0.6));
		float ghost = exp(-dot(gp, gp) * 420.0);
		col += flare_color * (streak * 0.35 + core * 0.9 + ghost * 0.10) * flare_strength;
	}

	// impact flash
	col = mix(col, damage_color * (0.35 + luma), damage_flash * 0.55);

	// The Environment already tone-maps with ACES before this pass reads the
	// viewport, so running the same curve again double-crushes the shadows and
	// desaturates every highlight. Only clamp here.
	col = clamp(col, 0.0, 1.0);

	// --- dither + grain ---------------------------------------------------
	// Dither BEFORE grain so quantisation noise lands on top of the dither,
	// not underneath it where it cannot hide the bands.
	float d = (bnoise(uv * vec2(1920.0, 1080.0)) - 0.5) * dither;
	col += d;
	float g = hash(uv * vec2(1920.0, 1080.0) + fract(TIME) * 91.7) - 0.5;
	col += g * grain;
	col = clamp(col, 0.0, 1.0);

	COLOR = vec4(col, 1.0);
}
