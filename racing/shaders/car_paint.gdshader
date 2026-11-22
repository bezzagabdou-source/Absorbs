// APEX VELOCITY — automotive paint.
// Stylised multilayer car paint:
//   base coat (deep saturated colour) + metallic sheen + lacquer clearcoat
//   + Fresnel rim + panel-edge ambient occlusion.
//
// Deliberately *not* using a per-pixel flake hash: a world-space hash changes
// value in every pixel it covers, which on a curved body renders as white
// noise instead of metallic sparkle. Real flake needs a high-res lookup texture
// with mipmaps; that is a bandwidth cost this mobile target cannot pay, so the
// finish is carried by the specular response instead.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 paint_color : source_color = vec3(0.13, 0.91, 1.0);
uniform vec3 flake_color : source_color = vec3(1.0, 1.0, 1.0);
uniform float metallic : hint_range(0.0, 1.0) = 0.72;
uniform float roughness : hint_range(0.0, 1.0) = 0.24;
uniform float clearcoat : hint_range(0.0, 1.0) = 1.0;
uniform float clearcoat_roughness : hint_range(0.0, 1.0) = 0.06;
uniform float flake_amount : hint_range(0.0, 1.0) = 0.0;
uniform float sheen : hint_range(0.0, 1.0) = 0.35;
uniform float rim_power : hint_range(0.0, 8.0) = 3.0;
uniform float rim_strength : hint_range(0.0, 1.0) = 0.35;
uniform vec3 rim_color : source_color = vec3(1.0, 1.0, 1.0);
uniform float ao_power : hint_range(0.0, 2.0) = 0.55;
uniform float world_noise_scale = 42.0;

varying vec3 world_pos;
varying vec3 world_normal;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float ndv = clamp(dot(normalize(world_normal), normalize(VIEW)), 0.0, 1.0);
	// Fresnel: edge of the body catches the sky, middle stays deep paint colour
	float fres = pow(1.0 - ndv, 5.0);
	// Fake ambient occlusion toward the sills and wheel arches. Height is taken
	// relative to the car's own origin (MODEL_MATRIX[3].y is the chassis pivot, so
	// this is a local height in metres). The previous bounds (-0.15 .. 0.55) put
	// almost the entire body outside the ramp, so every panel got the bright end
	// of the mix and, combined with the studio key light, the paint clipped to
	// flat white — the car looked like an unpainted shell.
	float local_h = world_pos.y - MODEL_MATRIX[3].y;
	float lower_ao = mix(1.0 - ao_power * 0.55, 1.0, smoothstep(-0.85, 0.75, local_h));

	// the top of every panel catches a little more sky, the sills less
	float panel_light = mix(0.92, 1.06, smoothstep(0.25, 0.85, world_normal.y));

	vec3 base = paint_color * lower_ao * panel_light;

	ALBEDO = base;
	// Base coat stays mostly dielectric: metallic=1.0 turns the whole body into
	// a mirror of the sun and blows out to white under a key light.
	METALLIC = clamp(metallic * 0.55, 0.0, 0.85);
	ROUGHNESS = clamp(roughness, 0.02, 1.0);
	SPECULAR = 0.50;

	// Clearcoat is not available in the GL Compatibility renderer, so the lacquer
	// layer is faked: tighten the roughness toward the clearcoat value and add a
	// white Fresnel sheen that peaks at grazing angles, which is what a real
	// clearcoat reads as on a curved panel.
	ROUGHNESS = mix(ROUGHNESS, clearcoat_roughness, clearcoat);
	vec3 coat = vec3(1.0) * fres * clearcoat * (1.0 - clearcoat_roughness * 0.6);

	// rim light additive on grazing angles = studio-light look
	// Additive terms stay subordinate to the base coat. At full strength the
	// clearcoat + rim + flake stack summed past 1.0 on every lit panel and ACES had
	// nothing left to roll off, which is what produced the white body.
	vec3 rim_vec = pow(1.0 - ndv, rim_power) * rim_strength * rim_color * 0.45;
	vec3 coat_vec = coat * 0.30;
	EMISSION = rim_vec + coat_vec + flake_color * sheen * fres * 0.10;

	// subtle white sheen along the top surfaces (roof, shoulders)
	float top = smoothstep(0.55, 1.0, normalize(world_normal).y);
	EMISSION += top * 0.045;
}
