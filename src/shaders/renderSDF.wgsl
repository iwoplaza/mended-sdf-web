@group(0) @binding(0) var output_tex: texture_storage_2d<{{OUTPUT_FORMAT}}, write>;

struct Material {
  color: vec3f,
}

struct MarchResult {
  material: Material,
}

const WIDTH = {{WIDTH}};
const HEIGHT = {{HEIGHT}};
const BLOCK_SIZE = 8;
const MAX_STEPS = 100;
const SURFACE_DIST = 0.0001;
const SKY_SPHERE_RADIUS = 1000;
// const PARALLEL_SAMPLES = 8;

fn convert_rgb_to_y(rgb: vec3f) -> f32 {
  return 16./255. + (64.738 * rgb.r + 129.057 * rgb.g + 25.064 * rgb.b) / 255.;
}

fn sphere_sdf(pos: vec3f, o: vec3f, r: f32) -> f32 {
  return distance(pos, o) - r;
}

fn O_sky_sdf(pos: vec3f) -> f32 {
  return SKY_SPHERE_RADIUS - length(pos);
}

fn O_sphere_sdf(pos: vec3f) -> f32 {
  return sphere_sdf(pos, vec3f(0, 0, 1), 0.5);
}

fn world_sdf(pos: vec3f) -> f32 {
  return min(
    O_sphere_sdf(pos),
    O_sky_sdf(pos)
  );
}

fn world_material(pos: vec3f, out: ptr<function, Material>) {
  // 0u
  var obj_idx = 0u;
  var min_dist = O_sphere_sdf(pos);

  // 1u
  let O_sky = O_sky_sdf(pos);
  if (O_sky < min_dist) {
    obj_idx = 1u;
    min_dist = O_sky;
  }

  if (obj_idx == 0u) { // O_sphere_sdf
    (*out).color = vec3f(1, 0.1, 0);
  }
  else if (obj_idx == 1u) { // O_sky_sdf
    (*out).color = vec3f(0.1, 0.15, 1);
  }
}

fn construct_ray(coord: vec3<u32>, out_pos: ptr<function, vec3f>, out_dir: ptr<function, vec3f>) {
  let dir = vec3f(
    (vec2f(coord.xy) / vec2f(WIDTH, HEIGHT)) * 2. - 1.,
    1.
  );

  let hspan = 1.;
  let vspan = 1.;

  *out_pos = vec3f(0, 0, 0);
  (*out_dir).x = dir.x * hspan;
  (*out_dir).y = dir.y * vspan;
  (*out_dir).z = 1.;
}

fn march(ray_pos: vec3f, ray_dir: vec3f, out: ptr<function, MarchResult>) {
  var pos = ray_pos;

  for (var step: u32 = 0; step <= MAX_STEPS; step++) {
    let min_dist: f32 = world_sdf(pos);

    if (min_dist < SURFACE_DIST) {
      break;
    }

    pos += ray_dir * min_dist;
  }

  var material: Material;
  world_material(pos, &material);
  (*out).material = material;
}

@compute @workgroup_size(BLOCK_SIZE, BLOCK_SIZE)
fn main_frag(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  construct_ray(GlobalInvocationID, &ray_pos, &ray_dir);

  var march_result: MarchResult;
  march(ray_pos, ray_dir, &march_result);
  let acc = march_result.material.color;

  textureStore(output_tex, GlobalInvocationID.xy, vec4(acc, 1.0));
}

@compute @workgroup_size(BLOCK_SIZE, BLOCK_SIZE)
fn main_aux(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  construct_ray(GlobalInvocationID, &ray_pos, &ray_dir);

  var march_result: MarchResult;
  march(ray_pos, ray_dir, &march_result);

  let view_normal = vec2f(0, 0); // TODO Fill up
  let albedo_luminance = 0.; // TODO Fill up
  let emission_luminance = 0.; // TODO Fill up

  let aux = vec4(
    view_normal.xy,
    albedo_luminance,
    emission_luminance
  );

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}

