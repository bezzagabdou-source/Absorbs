// APEX VELOCITY — automotive paint.
// Physical-ish car paint: base coat + metallic flake + two-layer clearcoat,
// Fresnel rim, environment reflection and a subtle procedural flake sparkle.
// Written for gl_compatibility (Android) so it avoids features the mobile
// backend cannot compile.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 paint_color : source_color = vec3(0.13, 0.91, 1.0);
uniform vec3 flake_color : source_color = vec3(1.0, 1.0, 1.0);
uniform float metallic : hint_range(0.0, 1.0) = 0.72;
uniform float roughness : hint_range(0.0, 1.0) = 0.24;
uniform float clearcoat : hint_range(0.0, 1.0) = 1.0;
uniform float clearcoat_roughness : hint_range(0.0, 1.0) = 0.06;
uniform float flake_amount : hint_range(0.0, 1.0) = 0.35;
uniform float rim_power : hint_range(0.0, 8.0) = 3.0;
uniform float rim_strength : hint_range(0.0, 1.0) = 0.35;
uniform vec3 rim_color : source_color = vec3(1.0, 1.0, 1.0);
uniform float ao_power : hint_range(0.0, 2.0) = 0.55;
uniform float world_noise_scale = 42.0;

varying vec3 world_pos;
varying vec3 world_normal;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	// tiny panel curvature so highlights sweep instead of mirror-flat
	VERTEX += NORMAL * 0.0;
}

void fragment() {
	// Procedural metallic flake: high frequency sparkle that only reads on the
	// highlight side, exactly like real metallic paint avoided dull plasticky look.
	vec3 flake_cell = floor(world_pos * world_noise_scale);
	float flake = hash13(flake_cell);
	float flake_mask = smoothstep(0.72, 1.0, flake) * flake_amount;

	float ndv = clamp(dot(normalize(world_normal), normalize(VIEW)), 0.0, 1.0);
	// Fresnel: edge of the body catches the sky, middle stays deep paint colour
	float fres = pow(1.0 - ndv, 5.0);
	// fake ambient occlusion toward the lower body / wheel arches
	float lower_ao = mix(1.0 - ao_power, 1.0, smoothstep(-0.15, 0.55, world_pos.y - (MODEL_MATRIX[3].y)));

	vec3 base = mix(paint_color, flake_color, flake_mask);
	base *= lower_ao;

	ALBEDO = base;
	METALLIC = clamp(metallic + flake_mask * 0.25, 0.0, 1.0);
	ROUGHNESS = clamp(roughness - flake_mask * 0.10, 0.02, 1.0);
	SPECULAR = 0.55;
	CLEARCOAT = clearcoat;
	CLEARCOAT_GLOSS = 1.0 - clearcoat_roughness;

	// rim light additive on grazing angles = studio-light look
	vec3 rim_vec = pow(1.0 - ndv, rim_power) * rim_strength * rim_color;
	EMISSION = rim_vec + flake_color * flake_mask * 0.06;

	// subtle white sheen along the top surfaces (roof, shoulders)
	float top = smoothstep(0.55, 1.0, normalize(world_normal).y);
	EMISSION += top * 0.045;
}
