// APEX VELOCITY — road surface.
// Triplanar asphalt with aggregate grain, wet patches, puddles and neon
// reflection streaks. All procedural so it stays CC0 and needs no textures.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 asphalt_color : source_color = vec3(0.055, 0.058, 0.068);
uniform vec3 aggregate_color : source_color = vec3(0.19, 0.20, 0.22);
uniform vec3 line_color : source_color = vec3(0.95, 0.96, 1.0);
uniform vec3 neon_a : source_color = vec3(0.13, 0.91, 1.0);
uniform vec3 neon_b : source_color = vec3(1.0, 0.18, 0.62);
uniform float wetness : hint_range(0.0, 1.0) = 0.35;
uniform float grain_scale = 220.0;
uniform float puddle_scale = 0.06;
uniform float neon_energy = 1.0;
uniform float road_width = 14.0;
uniform float track_scroll = 0.0;

varying vec3 wpos;
varying vec3 wnorm;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(i);
	float b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0));
	float d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * vnoise(p);
		p *= 2.07;
		a *= 0.5;
	}
	return v;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnorm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec2 uv = wpos.xz;

	// --- aggregate grain: two octaves so it reads both up close and at speed
	float g1 = vnoise(uv * grain_scale);
	float g2 = vnoise(uv * grain_scale * 0.23);
	float grain = mix(0.35, 1.0, g1 * 0.65 + g2 * 0.35);

	// --- tar seams and patched repairs
	float seam = smoothstep(0.02, 0.0, abs(fract(uv.y * 0.021 + vnoise(uv * 0.4) * 0.02) - 0.5) - 0.48);

	vec3 col = mix(asphalt_color, aggregate_color, grain * 0.55);
	col *= mix(1.0, 0.72, seam * 0.5);

	// --- wet layer: broad low-frequency patches, plus fine standing water
	float wet_mask = fbm(uv * puddle_scale) ;
	float puddle = smoothstep(0.55, 0.78, wet_mask) * wetness;
	float damp = smoothstep(0.30, 0.70, wet_mask) * wetness;

	// wet asphalt is darker and much glossier
	col = mix(col, col * 0.55, damp);
	ROUGHNESS = mix(0.92, 0.10, max(puddle, damp * 0.55));
	METALLIC = 0.0;
	SPECULAR = mix(0.32, 0.72, damp);

	// --- painted lane lines
	float half_w = road_width * 0.5;
	float edge = smoothstep(0.16, 0.0, abs(abs(wpos.x) - 0.0) * 0.0);
	float lane_dist = abs(fract(uv.x / 3.4) - 0.5) * 3.4;
	float dash = step(0.45, fract(uv.y * 0.18));
	float lane = smoothstep(0.10, 0.045, lane_dist) * dash * 0.75;
	col = mix(col, line_color * (0.55 + 0.45 * wetness), lane);

	// --- neon reflection streaks in the wet surface (vertical smear of light)
	float streak = smoothstep(0.35, 0.0, abs(uv.x)) * puddle;
	float neon_mix = 0.5 + 0.5 * sin(uv.y * 0.05 + wpos.z * 0.01);
	vec3 neon = mix(neon_a, neon_b, neon_mix);
	float shimmer = 0.6 + 0.4 * vnoise(uv * 3.0);
	EMISSION = neon * streak * neon_energy * shimmer * 0.18;

	// --- puddles reflect the sky a little through emission tint
	EMISSION += mix(neon_a, vec3(1.0), 0.35) * puddle * 0.05;

	ALBEDO = col;
	// perturb the normal with the grain so highlights break up like real asphalt
	vec3 n = normalize(wnorm);
	vec2 grad = vec2(vnoise(uv * grain_scale * 0.5 + 3.1), vnoise(uv * grain_scale * 0.5 - 7.7)) - 0.5;
	n = normalize(n + vec3(grad.x, 0.0, grad.y) * mix(0.22, 0.05, damp));
	NORMAL = n;
}
