// APEX VELOCITY — terrain / open world ground.
// Triplanar procedural material that blends sand, rock, grass and snow by
// height and slope, with macro colour variation so large landscapes never
// look tiled. Used by the open-world region generator.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 grass_color : source_color = vec3(0.13, 0.22, 0.11);
uniform vec3 rock_color : source_color = vec3(0.26, 0.25, 0.24);
uniform vec3 sand_color : source_color = vec3(0.72, 0.60, 0.42);
uniform vec3 snow_color : source_color = vec3(0.88, 0.92, 0.98);
uniform vec3 road_tint : source_color = vec3(0.12, 0.12, 0.14);
uniform float rock_slope : hint_range(0.0, 1.0) = 0.62;
uniform float snow_line : hint_range(-1.0, 1.0) = 0.72;
uniform float macro_scale = 0.012;
uniform float debug_flat : hint_range(0.0, 1.0) = 0.0;
uniform float detail_scale = 0.9;
uniform float wetness : hint_range(0.0, 1.0) = 0.0;
uniform float road_blend_width = 7.0;
// --- highway painted straight onto the ground ---------------------------------
// The carriageway is drawn HERE as well as by its own ribbon mesh. The ribbon is
// 16 m wide and sits 1.7 m up for the collider, so from a chase camera it is a
// thin strip that vanishes over every crest and can be buried by the interpolated
// terrain. Painting the asphalt into the ground shader means the road is always
// present, always the right width, and can never z-fight with what it sits on.
uniform float road_ring_radius = 620.0;
uniform float road_half_width = 8.0;
uniform float road_shoulder = 3.0;
uniform vec3 road_surface_color : source_color = vec3(0.115, 0.125, 0.145);
uniform vec3 road_paint_color : source_color = vec3(0.93, 0.95, 1.0);
uniform vec3 road_edge_light : source_color = vec3(0.16, 0.92, 1.0);
uniform float road_fade = 0.0;
// Colour of the sky above the horizon, written by the environment rig each time
// the preset changes. Used as the ground-level bounce so a night map is lit by
// its own sky instead of by a hard-coded guess.
uniform vec3 sky_bounce_color : source_color = vec3(0.36, 0.31, 0.52);
uniform float sky_bounce_energy : hint_range(0.0, 3.0) = 1.0;

varying vec3 wpos;
vec3 road_emission = vec3(0.0);
varying vec3 wnorm;
varying float terrain_up;

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
	float acc = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		acc += a * vnoise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return acc;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	// The terrain mesh is authored in world space with the identity basis, while
	// the node may be rotated by its parent. NORMAL is fed to the fragment stage
	// already in world space, so transforming it again double-applies the
	// rotation and (with a Y-flip) inverts the lighting.
	wnorm = NORMAL;
	terrain_up = NORMAL.y;
}

void fragment() {
	vec3 n = normalize(wnorm);
	float slope = 1.0 - clamp(terrain_up, 0.0, 1.0);

	// triplanar detail: pick the two dominant axes so no stretching appears
	float d1 = vnoise(wpos.xz * detail_scale);
	float d2 = vnoise(wpos.zy * detail_scale * 0.7);
	float d3 = vnoise(wpos.xy * detail_scale * 0.9);
	float detail = (d1 * n.y + d2 * abs(n.x) + d3 * abs(n.z));

	// macro variation at low frequency (biome patches)
	float macro = fbm(wpos.xz * macro_scale);
	float macro2 = fbm(wpos.xz * macro_scale * 3.1 + 17.0);

	vec3 ground = mix(grass_color, sand_color, smoothstep(0.42, 0.66, macro));
	ground = mix(ground, rock_color, smoothstep(rock_slope - 0.12, rock_slope + 0.16, slope));
	ground *= mix(0.82, 1.12, detail * 0.6 + macro2 * 0.4);

	// snow settles on flat, high ground
	float snow = smoothstep(snow_line - 0.06, snow_line + 0.10, terrain_up * 0.65 + wpos.y * 0.00002);
	snow *= smoothstep(0.35, 0.7, macro2 + 0.25);
	ground = mix(ground, snow_color, clamp(snow, 0.0, 1.0));

	// --- the highway ---------------------------------------------------------
	float ang = atan(wpos.z, wpos.x);
	float ring_r = road_ring_radius * (1.0 + 0.10 * sin(ang * 3.0) + 0.05 * cos(ang * 5.0));
	float radial = length(wpos.xz) - ring_r;      // signed metres from the centreline
	float wheel = abs(radial);
	float asphalt = 1.0 - smoothstep(road_half_width - 0.6, road_half_width + 0.2, wheel);
	float shoulder = 1.0 - smoothstep(road_half_width, road_half_width + road_shoulder, wheel);
	float along = ang * road_ring_radius;          // arc metres, for the dashes
	// lane dashes: 3.6 m pitch, painted 55% of the time
	float lane_gap = abs(fract((radial + road_half_width) / 3.6 + 0.5) - 0.5) * 3.6;
	float dash = step(0.45, fract(along / 9.0));
	float lane = (1.0 - smoothstep(0.10, 0.22, lane_gap)) * dash;
	float centre = 1.0 - smoothstep(0.16, 0.34, abs(wheel - 0.30));
	float edge = 1.0 - smoothstep(0.14, 0.30, abs(wheel - (road_half_width - 0.55)));
	float paint = clamp(max(max(lane, centre), edge), 0.0, 1.0) * asphalt;
	float agg = vnoise(wpos.xz * 26.0) * 0.5 + vnoise(wpos.xz * 7.0) * 0.5;
	vec3 tarmac = road_surface_color * (0.82 + agg * 0.36);
	ground = mix(ground, tarmac, asphalt);
	ground = mix(ground, road_tint, shoulder * 0.35 * (1.0 - asphalt));
	ground = mix(ground, road_paint_color, paint);
	float kerb = 1.0 - smoothstep(0.05, 0.22, abs(wheel - (road_half_width - 0.16)));
	road_emission = road_edge_light * kerb * 1.5 + road_paint_color * paint * 0.55;

	// Sky bounce. Without this a night scene crushes the whole landscape to pure
	// black, because the only directional light is a 0.3-energy moon and the
	// compatibility backend's sky ambient does not reach large flat surfaces.
	// Kept deliberately low: at 1.35 this lit the countryside like overcast noon
	// and the tarmac stopped reading as the darkest thing in frame. 0.45 keeps
	// the land visible as shapes at night while staying clearly below the paint.
	// Deliberately dim and only faintly blue. The earlier value (0.78, 0.86, 1.05)
	// at 0.45 energy made the whole plain read as bright blue water and, worse,
	// out-shone the tarmac — the road has to be the brightest surface in frame.
	vec3 sky_bounce = mix(vec3(0.34, 0.38, 0.46), vec3(0.46, 0.51, 0.60), terrain_up);
	// emissive bounce is applied on ALBEDO-scaled colour and NOT affected by fog
	// the way lighting is, so it reads as ground-level ambient instead of haze
	if (debug_flat > 0.5) {
		ALBEDO = vec3(0.0, 1.0, 0.2);
		EMISSION = vec3(0.0, 1.0, 0.2);
	} else {
		ALBEDO = ground;
		EMISSION = ground * sky_bounce * 0.42 + road_emission;
	}
	ROUGHNESS = mix(0.95, 0.72, road) - wetness * 0.35;
	METALLIC = 0.0;
	SPECULAR = mix(0.25, 0.55, wetness);

	NORMAL = normalize(n + vec3(detail - 0.5, 0.0, macro2 - 0.5) * 0.22);
}
