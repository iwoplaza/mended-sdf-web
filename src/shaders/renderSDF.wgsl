struct Material {
  color: vec3f,
  emissive: bool,
}

struct MarchResult {
  position: vec3f,
  material: Material,
  normal: vec3f,
}

const WIDTH = {{WIDTH}};
const HEIGHT = {{HEIGHT}};
const WHITE_NOISE_BUFFER_SIZE = {{WHITE_NOISE_BUFFER_SIZE}};
const PI = 3.14159265359;
const BLOCK_SIZE = 8;
const MAX_STEPS = 1000;
const SURFACE_DIST = 0.0001;
const SKY_SPHERE_RADIUS = 10;
const SUB_SAMPLES = 512;

@group(0) @binding(0) var<storage, read> white_noise_buffer: array<f32, WHITE_NOISE_BUFFER_SIZE>;
@group(1) @binding(0) var output_tex: texture_storage_2d<{{OUTPUT_FORMAT}}, write>;

fn convert_rgb_to_y(rgb: vec3f) -> f32 {
  return 16./255. + (64.738 * rgb.r + 129.057 * rgb.g + 25.064 * rgb.b) / 255.;
}

fn randf(seed: ptr<function, u32>) -> f32 {
  let curr_seed = (*seed + 1) % WHITE_NOISE_BUFFER_SIZE;

  *seed = curr_seed;

  return white_noise_buffer[curr_seed];
}

fn rand_in_unit_cube(seed: ptr<function, u32>) -> vec3f {
  return vec3f(
    randf(seed) * 2. - 1.,
    randf(seed) * 2. - 1.,
    randf(seed) * 2. - 1.,
  );
}

fn rand_in_circle(seed: ptr<function, u32>) -> vec2f {
  let radius = sqrt(randf(seed));
  let angle = randf(seed) * 2 * PI;

  return vec2f(
    cos(angle) * radius,
    sin(angle) * radius,
  );
}

fn rand_on_hemisphere(seed: ptr<function, u32>, normal: vec3f) -> vec3f {
  var value = rand_in_unit_cube(seed);

  if (dot(normal, value) < 0.) {
    value *= -1.;
  }

  value += normal * 0.01;
  
  return normalize(value);
}

fn sphere_sdf(pos: vec3f, o: vec3f, r: f32) -> f32 {
  return distance(pos, o) - r;
}

fn O_sky_sdf(pos: vec3f) -> f32 {
  return SKY_SPHERE_RADIUS - length(pos);
}

fn O_sphere1_sdf(pos: vec3f) -> f32 {
  return sphere_sdf(pos, vec3f(-0.7, 0, 1), 0.2);
}

fn O_sphere2_sdf(pos: vec3f) -> f32 {
  return sphere_sdf(pos, vec3f(0, 0, 1), 0.3);
}

fn O_sphere3_sdf(pos: vec3f) -> f32 {
  return sphere_sdf(pos, vec3f(0.5, 0, 0.5), 0.2);
}

fn world_sdf(pos: vec3f) -> f32 {
  return min(
    O_sphere1_sdf(pos),
    min(
    O_sphere2_sdf(pos),
    min(
    O_sphere3_sdf(pos),
    O_sky_sdf(pos)
  )));
}

fn world_material(pos: vec3f, out: ptr<function, Material>) {
  var obj_idx = 0u;
  var obj_dist = O_sky_sdf(pos);
  var min_dist = obj_dist;

  // 0u
  obj_dist = O_sky_sdf(pos);
  if (obj_dist < min_dist) {
    obj_idx = 0u;
    min_dist = obj_dist;
  }

  // 1u
  obj_dist = O_sphere1_sdf(pos);
  if (obj_dist < min_dist) {
    obj_idx = 1u;
    min_dist = obj_dist;
  }

  // 2u
  obj_dist = O_sphere2_sdf(pos);
  if (obj_dist < min_dist) {
    obj_idx = 2u;
    min_dist = obj_dist;
  }

  // 3u
  obj_dist = O_sphere3_sdf(pos);
  if (obj_dist < min_dist) {
    obj_idx = 3u;
    min_dist = obj_dist;
  }

  if (obj_idx == 0u) { // O_sky_sdf
    let dir = normalize(pos);
    let t = dir.y / 2. + 0.5;
    (*out).emissive = true;
    
    let uv = floor(30.0 * dir.xy);
    let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

    (*out).color = mix(
      vec3f(0.1, 0.15, 0.5),
      vec3f(0.7, 0.9, 1),
      t,
    ) * mix(1., 0., c);

    // (*out).color = vec3f(0.4, 0.5, 0.6);
  }
  else if (obj_idx == 1u) { // O_sphere1_sdf
    (*out).emissive = false;
    (*out).color = vec3f(1, 0.9, 0.8);
  }
  else if (obj_idx == 2u) { // O_sphere2_sdf
    (*out).emissive = false;
    (*out).color = vec3f(0.5, 0.7, 1);
  }
  else if (obj_idx == 3u) { // O_sphere3_sdf
    (*out).emissive = false;
    (*out).color = vec3f(0.5, 1, 0.7);
  }
}

fn world_normals(point: vec3f) -> vec3f {
  let epsilon = SURFACE_DIST * 0.1; // arbitrary - should be smaller than any surface detail in your distance function, but not so small as to get lost in float precision
  let offX = vec3f(point.x + epsilon, point.y, point.z);
  let offY = vec3f(point.x, point.y + epsilon, point.z);
  let offZ = vec3f(point.x, point.y, point.z + epsilon);
  
  let centerDistance = world_sdf(point);
  let xDistance = world_sdf(offX);
  let yDistance = world_sdf(offY);
  let zDistance = world_sdf(offZ);

  return normalize(vec3f(
    (xDistance - centerDistance),
    (yDistance - centerDistance),
    (zDistance - centerDistance),
  ) / epsilon);
}

fn construct_ray(coord: vec2f, out_pos: ptr<function, vec3f>, out_dir: ptr<function, vec3f>) {
  let dir = vec3f(
    (coord / vec2f(WIDTH, HEIGHT)) * 2. - 1.,
    1.
  );

  let hspan = 1.;
  let vspan = -1.;

  *out_pos = vec3f(0, 0, 0);
  (*out_dir).x = dir.x * hspan;
  (*out_dir).y = dir.y * vspan;
  (*out_dir).z = 1.;
}

fn march(ray_pos: vec3f, ray_dir: vec3f, out: ptr<function, MarchResult>) {
  var pos = ray_pos;

  var prev_dist = 0.;

  for (var step: u32 = 0; step <= MAX_STEPS; step++) {
    let dist: f32 = world_sdf(pos);

    if (dist < SURFACE_DIST && dist < prev_dist) {
      break;
    }

    pos += ray_dir * dist;
    prev_dist = dist;
  }

  (*out).position = pos;

  var material: Material;
  world_material(pos, &material);
  (*out).material = material;

  (*out).normal = world_normals(pos);
}

@compute @workgroup_size(BLOCK_SIZE, BLOCK_SIZE)
fn main_frag(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;

  let time = 0.; // TODO: Add time
  var seed = GlobalInvocationID.x + GlobalInvocationID.y * WIDTH + GlobalInvocationID.z * WIDTH * HEIGHT;

  var acc = vec3f(0., 0., 0.);
  var march_result: MarchResult;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  for (var ss = 0u; ss < SUB_SAMPLES; ss++) {
    // Anti-aliasing
    // TODO: Offset in view space, not in world space.
    // TODO: Maybe offset by sub-pixel density?.
    // let offset = vec2f(
    //   randf(&seed) * 1.,
    //   randf(&seed) * 1.,
    // );
    let offset = rand_in_circle(&seed) * 0.9 + 0.5;

    construct_ray(vec2f(GlobalInvocationID.xy) + offset, &ray_pos, &ray_dir);

    var sub_acc = vec3f(1., 1., 1.);

    for (var refl = 0u; refl < 2u; refl++) {
      march(ray_pos, ray_dir, &march_result);
      ray_pos = march_result.position;
      ray_dir = rand_on_hemisphere(&seed, march_result.normal);
      // ray_dir = march_result.normal;
      sub_acc *= march_result.material.color;

      if (march_result.material.emissive) {
        break;
      }
    }

    acc += sub_acc;
  }

  acc /= SUB_SAMPLES;

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

  construct_ray(vec2f(GlobalInvocationID.xy), &ray_pos, &ray_dir);

  var march_result: MarchResult;
  march(ray_pos, ray_dir, &march_result);

  let world_normal = march_result.normal; // TODO Fill up
  let albedo_luminance = convert_rgb_to_y(march_result.material.color); // TODO Fill up
  let emission_luminance = 0.; // TODO Fill up
  
  // var seed = GlobalInvocationID.x + GlobalInvocationID.y * WIDTH + GlobalInvocationID.z * WIDTH * HEIGHT;
  // let albedo_luminance = randf(&seed); // TODO Fill up

  let view_normal = vec2f(world_normal.x, world_normal.y);

  let aux = vec4(
    view_normal.xy,
    albedo_luminance,
    emission_luminance
  );

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}

