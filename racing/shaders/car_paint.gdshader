// APEX VELOCITY — automotive paint, v3.
//
// Goals, in priority order:
//   1. Read as paint, not as coloured plastic. A real car body is a dielectric
//      base coat with metal flake suspended in it, buried under a clear lacquer.
//   2. Never blow out to white. The v2 shader summed clearcoat + rim + flake and
//      clipped on every lit panel; every additive term is now budgeted and the
//      whole stack is normalised before it leaves the shader.
//   3. Give the eye panel structure. A perfect unbroken surface looks like a
//      toy; the shut-lines, the shoulder highlight and the sill shadow are what
//      make a lofted shell read as a car.
//
// Everything is analytic — no textures, no per-pixel hash noise — because a
// world-space hash changes value on every pixel it covers and renders as white
// noise on a curved panel, and a real flake texture costs bandwidth this mobile
// target does not have. Metallic sparkle is carried by the specular lobe.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 paint_color : source_color = vec3(0.13, 0.91, 1.0);
uniform vec3 flake_color : source_color = vec3(1.0, 1.0, 1.0);
uniform vec3 rim_color : source_color = vec3(1.0, 1.0, 1.0);
uniform float metallic : hint_range(0.0, 1.0) = 0.72;
uniform float roughness : hint_range(0.0, 1.0) = 0.24;
uniform float clearcoat : hint_range(0.0, 1.0) = 1.0;
uniform float clearcoat_roughness : hint_range(0.0, 1.0) = 0.06;
uniform float flake_amount : hint_range(0.0, 1.0) = 0.0;
uniform float sheen : hint_range(0.0, 1.0) = 0.35;
uniform float rim_power : hint_range(0.0, 8.0) = 3.0;
uniform float rim_strength : hint_range(0.0, 1.0) = 0.35;
uniform float ao_power : hint_range(0.0, 2.0) = 0.55;
uniform float world_noise_scale = 42.0;
// body dimensions in metres, pushed in by CarModel so the shut-lines, the
// shoulder crease and the sill shadow land on the real proportions of the car
uniform vec3 body_size = vec3(1.9, 1.2, 4.6);
uniform float damage : hint_range(0.0, 1.0) = 0.0;
uniform float dirt : hint_range(0.0, 1.0) = 0.0;
uniform float panel_lines : hint_range(0.0, 1.0) = 1.0;

varying vec3 local_pos;
varying vec3 world_pos;
varying vec3 world_normal;

void vertex() {
	local_pos = VERTEX;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

// A thin dark groove at a given coordinate: returns 0..1 darkness.
float shut_line(float coord, float at, float width) {
	return 1.0 - smoothstep(width, width * 2.2, abs(coord - at));
}

void fragment() {
	vec3 n = normalize(world_normal);
	float ndv = clamp(dot(n, normalize(VIEW)), 0.0, 1.0);
	float fres = pow(1.0 - ndv, 5.0);

	// ---- panel structure ---------------------------------------------------
	// Local coordinates, so the creases are fixed to the car and not the world.
	vec3 half_size = body_size * 0.5;
	float ny = clamp(local_pos.y / max(0.001, half_size.y) * 0.5 + 0.5, 0.0, 1.0);
	float nz = clamp(local_pos.z / max(0.001, half_size.z) * 0.5 + 0.5, 0.0, 1.0);
	float nx = clamp(local_pos.x / max(0.001, half_size.x) * 0.5 + 0.5, 0.0, 1.0);

	float line = 0.0;
	// door shut-lines run across the side of the body at the front and rear
	// edge of the door aperture (roughly 30 % and 62 % of the length)
	line = max(line, shut_line(nz, 0.315, 0.0018));
	line = max(line, shut_line(nz, 0.618, 0.0018));
	// the bonnet and boot lid seams, only visible from above
	float top_mask = smoothstep(0.55, 0.9, n.y);
	line = max(line, top_mask * shut_line(nz, 0.175, 0.0016));
	line = max(line, top_mask * shut_line(nz, 0.845, 0.0016));
	// the fuel filler cap, a small circle on the rear quarter
	float cap = 1.0 - smoothstep(0.012, 0.028,
		length(vec2(nz - 0.78, nx - 0.72)));
	line = max(line, cap * 0.55);
	line *= panel_lines;

	// shoulder crease: a soft highlight running the length of the body at the
	// widest point — this is the line every real car is designed around
	float shoulder = 1.0 - abs(nx - 0.52) * 4.0;
	shoulder = clamp(shoulder, 0.0, 1.0);
	shoulder = pow(shoulder, 3.0);

	// sill shadow: the bottom 18 % of the body is darker, which is what makes a
	// car look like it has ground clearance instead of floating
	float sill = mix(0.74, 1.0, smoothstep(0.04, 0.30, ny));

	// ---- paint -------------------------------------------------------------
	vec3 base = paint_color * sill;
	// a second, slightly lighter coat on the shoulder catches the sky
	base = mix(base, base * 1.10 + flake_color * 0.035, shoulder * 0.8);
	// shut lines are paint in shadow: darken rather than paint black
	base *= mix(1.0, 0.42, line);

	// ---- wear --------------------------------------------------------------
	// Damage darkens toward a scorched grey; dirt is a desaturated dust film on
	// the lower half, strongest at the sills and the wheel arches.
	vec3 scorched = mix(base, vec3(0.16, 0.15, 0.14), damage * 0.75);
	base = scorched;
	float dirt_mask = (1.0 - smoothstep(0.10, 0.55, ny)) * dirt;
	base = mix(base, vec3(0.32, 0.29, 0.25) * (0.6 + 0.4 * base.g), dirt_mask * 0.7);

	ALBEDO = base;
	METALLIC = clamp(metallic * 0.55, 0.0, 0.85);
	ROUGHNESS = clamp(roughness, 0.02, 1.0);

	// ---- gloss -------------------------------------------------------------
	// GL Compatibility has no clearcoat lobe, so the lacquer is faked by
	// tightening roughness and adding a Fresnel sheen that peaks at graze.
	ROUGHNESS = mix(ROUGHNESS, clearcoat_roughness, clearcoat);
	// dirt and damage scatter the highlight instead of mirroring it
	ROUGHNESS = clamp(ROUGHNESS + dirt_mask * 0.35 + damage * 0.25, 0.02, 1.0);

	float coat = fres * clearcoat * (1.0 - clearcoat_roughness * 0.6);
	vec3 rim_vec = pow(1.0 - ndv, rim_power) * rim_strength * rim_color * 0.45;
	vec3 coat_vec = vec3(1.0) * coat * 0.30;
	// budget the whole additive stack, then scale it back under damage
	vec3 additive = rim_vec + coat_vec + flake_color * sheen * fres * 0.10;
	additive += vec3(shoulder * 0.05);
	additive *= (1.0 - damage * 0.55) * (1.0 - line * 0.8);
	EMISSION = min(additive, vec3(0.85));
}
