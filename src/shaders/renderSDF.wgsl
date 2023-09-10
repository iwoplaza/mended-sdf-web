struct Material {
  color: vec3f,
  roughness: f32,
  emissive: bool,
}

struct MarchResult {
  position: vec3f,
  material: Material,
  normal: vec3f,
}

struct SphereObj {
  xyzr: vec4f,
  material_idx: u32,
}

const DOMAIN_AABB = 0u;
const DOMAIN_PLANE = 1u;

struct MarchDomain {
  kind: u32,
  pos: vec3f,
  extra: vec3f,
}

struct SceneInfo {
  num_of_spheres: u32,
  num_of_domains: u32,
}

const MAX_DOMAINS = 16;
const WIDTH = {{WIDTH}};
const HEIGHT = {{HEIGHT}};
const BLOCK_SIZE = {{BLOCK_SIZE}};
const PARALLEL_SAMPLES = {{PARALLEL_SAMPLES}};
const WHITE_NOISE_BUFFER_SIZE = {{WHITE_NOISE_BUFFER_SIZE}};
const PI = 3.14159265359;
const PI2 = 2. * PI;
const MAX_STEPS = 1000;
const SURFACE_DIST = 0.0001;
const SUPER_SAMPLES = 4;
const SUB_SAMPLES = 4;
const MAX_REFL = 3u;
const FAR = 100.;

const VEC3F_MAX = vec3f(1., 1., 1.);

@group(0) @binding(0) var<storage, read> white_noise_buffer: array<f32, WHITE_NOISE_BUFFER_SIZE>;
@group(0) @binding(1) var<uniform> time: f32;

@group(1) @binding(0) var output_tex: texture_storage_2d<{{OUTPUT_FORMAT}}, write>;

@group(2) @binding(0) var<storage, read> scene_info: SceneInfo;
@group(2) @binding(1) var<storage, read> scene_spheres: array<SphereObj>;
@group(2) @binding(2) var<storage, read> domains: array<MarchDomain>;

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

  value += normal * 0.1;
  
  return normalize(value);
}

// -- SDF

fn sphere_sdf(pos: vec3f, o: vec3f, r: f32) -> f32 {
  return distance(pos, o) - r;
}

fn world_sdf(pos: vec3f) -> f32 {
  var obj_idx = -1;
  var min_dist = FAR;

  for (var idx = 0u; idx < scene_info.num_of_spheres; idx++) {
    let obj_dist = sphere_sdf(pos, scene_spheres[idx].xyzr.xyz, scene_spheres[idx].xyzr.w);

    if (obj_dist < min_dist) {
      min_dist = obj_dist;
      obj_idx = i32(idx);
    }
  }

  return min_dist;
}

fn sky_color(dir: vec3f) -> vec3f {
  let t = dir.y / 2. + 0.5;
  
  let uv = floor(30.0 * dir.xy);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  return mix(
    vec3f(0.1, 0.15, 0.5),
    vec3f(0.7, 0.9, 1),
    t,
  ) * mix(1., 0., c);
}

fn world_material(pos: vec3f, out: ptr<function, Material>) {
  var obj_idx = -1;
  var min_dist = FAR;

  for (var idx = 0u; idx < scene_info.num_of_spheres; idx++) {
    let obj_dist = sphere_sdf(pos, scene_spheres[idx].xyzr.xyz, scene_spheres[idx].xyzr.w);

    if (obj_dist < min_dist) {
      min_dist = obj_dist;
      obj_idx = i32(idx);
    }
  }

  if (obj_idx == -1) { // sky
    let dir = normalize(pos);
    (*out).emissive = true;
    (*out).color = sky_color(dir);
  }
  else {
    let mat_idx = scene_spheres[obj_idx].material_idx;

    if (mat_idx == 0) {
      (*out).emissive = false;
      (*out).roughness = 0.3;
      (*out).color = vec3f(1, 0.9, 0.8);
    }
    else if (mat_idx == 1) {
      (*out).emissive = false;
      (*out).roughness = 1.;
      (*out).color = vec3f(0.5, 0.7, 1);
    }
    else if (mat_idx == 2) {
      (*out).emissive = true;
      (*out).color = vec3f(0.5, 1, 0.7) * 10;
    }
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

  return vec3f(
    (xDistance - centerDistance),
    (yDistance - centerDistance),
    (zDistance - centerDistance),
  ) / epsilon;
}

struct RayHitInfo {
  start: f32,
  end: f32,
}

/**
 * Calcs intersection and exit distances, and normal at intersection.
 * The ray must be in box/object space. If you have multiple boxes all
 * aligned to the same axis, you can precompute 1/rd. If you have
 * multiple boxes but they are not alligned to each other, use the 
 * "Generic" box intersector bellow this one.
 * 
 * @see {https://iquilezles.org/articles/boxfunctions/}
 * @author {Inigo Quilez}
 */
fn ray_to_box(ro: vec3f, inv_ray_dir: vec3f, rad: vec3f, near_hit: ptr<function, f32>, far_hit: ptr<function, f32>) {
  let n = inv_ray_dir * ro;

  let k = abs(inv_ray_dir) * rad;

  let t1 = -n - k;
  let t2 = -n + k;

  let tN = max(max(t1.x, t1.y), t1.z);
  let tF = min(min(t2.x, t2.y), t2.z);

  if(tN > tF || tF < 0.)
  {
    // no intersection
    *near_hit = -1.;
    *far_hit = -1.;
  }
  else
  {
    *near_hit = tN;
    *far_hit = tF;
  }
}

/**
 * @param pn Plane normal. Must be normalized
 */
fn ray_to_plane(ro: vec3f, rd: vec3f, pn: vec3f, d: f32) -> f32 {
  return -(dot(ro, pn) + d) / dot(rd, pn);
}

fn sort_primitives(ray_pos: vec3f, ray_dir: vec3f, out_hit_order: ptr<function, array<RayHitInfo, MAX_DOMAINS>>) -> u32 {
  var list_length = 0u;

  let inv_ray_dir = vec3f(
    1. / ray_dir.x,
    1. / ray_dir.y,
    1. / ray_dir.z,
  );

  for (var i = 0u; i < scene_info.num_of_domains; i++) {
    var domain = domains[i];

    var near_hit = -1.;
    var far_hit = -1.;

    if (domain.kind == DOMAIN_PLANE) {
      if (dot(ray_dir, domain.extra /* normal */) < 0) {
        let d = -dot(domain.pos, domain.extra /* normal */);
        near_hit = ray_to_plane(ray_pos, ray_dir, domain.extra /* normal */, d);
        far_hit = FAR;
      }
    }
    else {
      ray_to_box(ray_pos - domain.pos, inv_ray_dir, domain.extra, &near_hit, &far_hit);
    }

    if (near_hit < 0) {
      continue;
    }

    // Insertion sort
    let el = &(*out_hit_order)[list_length];
    (*el).start = near_hit;
    (*el).end = far_hit;

    for (var s = list_length - 1; s >= 0; s--) {
      let elA = &(*out_hit_order)[s];
      let elB = &(*out_hit_order)[s + 1];
      if ((*elA).start <= (*elB).start)
      {
        // Good order
        break;
      }

      // Swap
      let tmp = *elA;
      *elA = *elB;
      *elB = tmp;
    }
    list_length++;
  }

  return list_length;
}

fn construct_ray(coord: vec2f, out_pos: ptr<function, vec3f>, out_dir: ptr<function, vec3f>) {
  var dir = vec3f(
    (coord / vec2f(WIDTH, HEIGHT)) * 2. - 1.,
    1.
  );

  let hspan = 1.;
  let vspan = 1.;

  dir.x *= hspan;
  dir.y *= -vspan;

  *out_pos = vec3f(0, 0, 0);
  *out_dir = normalize(dir);
}

fn march(ray_pos: vec3f, ray_dir: vec3f, out: ptr<function, MarchResult>) {
  var hit_order = array<RayHitInfo, MAX_DOMAINS>();
  let hit_domains = sort_primitives(ray_pos, ray_dir, /*out*/ &hit_order);

  // Did not hit any domains
  if (hit_domains == 0) {
    // Sky color
    (*out).material.color = sky_color(ray_dir);
    (*out).material.emissive = true;
    (*out).normal = -ray_dir;
    return;
  }

  var pos = ray_pos;
  var prev_dist = -1.;
  var min_dist = FAR;

  for (var b = 0u; b < hit_domains; b++) {
    prev_dist = -1.;
    var progress = hit_order[b].start - SURFACE_DIST;

    for (var step = 0u; step <= MAX_STEPS; step++) {
      pos = ray_pos + ray_dir * progress;
      min_dist = world_sdf(pos);

      // Inside volume?
      if (min_dist <= 0. && prev_dist > 0.) {
        // No need to check more objects.
        b = hit_domains;
        break;
      }

      if (min_dist < SURFACE_DIST && min_dist < prev_dist) {
        // No need to check more objects.
        b = hit_domains;
        break;
      }

      // march forward safely
      progress += min_dist;

      if (progress > hit_order[b].end)
      {
        // Stop checking this domain.
        break;
      }

      prev_dist = min_dist;
    }
  }

  (*out).position = pos;

  // Not near surface or distance rising?
  if (min_dist > SURFACE_DIST * 2. || min_dist > prev_dist)
  {
    // Sky
    (*out).material.color = sky_color(ray_dir);
    (*out).material.emissive = true;
    (*out).normal = -ray_dir;
    return;
  }

  var material: Material;
  world_material(pos, &material);
  (*out).material = material;
  (*out).normal = world_normals(pos);
}

var<workgroup> parallel_buffer: array<array<vec3f, PARALLEL_SAMPLES>, BLOCK_SIZE * BLOCK_SIZE>;

@compute @workgroup_size(BLOCK_SIZE, BLOCK_SIZE, PARALLEL_SAMPLES)
fn main_frag(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  let parallel_idx = LocalInvocationID.y * BLOCK_SIZE + LocalInvocationID.x;

  // var seed = (GlobalInvocationID.x * 17) + GlobalInvocationID.y * (WIDTH) + GlobalInvocationID.z * (WIDTH * HEIGHT) + u32(time * 0.005) * 3931;
  var seed = (GlobalInvocationID.x + GlobalInvocationID.y * (WIDTH) + GlobalInvocationID.z * (WIDTH * HEIGHT)) * (SUPER_SAMPLES * SUPER_SAMPLES * SUB_SAMPLES * MAX_REFL * 3 + 1 + u32(time));

  var acc = vec3f(0., 0., 0.);
  var march_result: MarchResult;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  for (var sx = 0; sx < SUPER_SAMPLES; sx++) {
    for (var sy = 0; sy < SUPER_SAMPLES; sy++) {
      let offset = vec2f(
        f32(sx) / SUPER_SAMPLES,
        f32(sy) / SUPER_SAMPLES,
      );
      
      for (var ss = 0u; ss < SUB_SAMPLES; ss++) {
        // Anti-aliasing
        // TODO: Offset in view space, not in world space.
        // TODO: Maybe offset by sub-pixel density?.
        // let offset = vec2f(
        //   randf(&seed),
        //   randf(&seed),
        // );

        construct_ray(vec2f(GlobalInvocationID.xy) + offset, &ray_pos, &ray_dir);
        
        // let offset = rand_in_circle(&seed) * 0.5 + vec2f(0.5, 0.5);
        var sub_acc = vec3f(1., 1., 1.);

        for (var refl = 0u; refl < MAX_REFL; refl++) {
          march(ray_pos, ray_dir, &march_result);

          sub_acc *= march_result.material.color;
          // sub_acc *= march_result.normal;

          if (march_result.material.emissive) {
            break;
          }

          // Reflecting: 𝑟=𝑑−2(𝑑⋅𝑛)𝑛
          let dn2 = 2. * dot(ray_dir, march_result.normal);
          let refl_dir = ray_dir - dn2 * march_result.normal;

          ray_pos = march_result.position;
          ray_dir = rand_on_hemisphere(&seed, march_result.normal);
          ray_dir = mix(refl_dir, ray_dir, march_result.material.roughness);
          ray_dir = normalize(ray_dir);
        }

        acc += sub_acc;
      }
    }
  }

  acc /= SUB_SAMPLES * SUPER_SAMPLES * SUPER_SAMPLES;
  parallel_buffer[parallel_idx][LocalInvocationID.z] = acc;

  // Waiting for the whole shared memory to be filled.
  workgroupBarrier();

  if (LocalInvocationID.z != 0) {
    return;
  }
  
  acc = vec3f(0, 0, 0);
  for (var i = 0; i < 1; i++) {
    acc += parallel_buffer[parallel_idx][i];
  }
  acc /= PARALLEL_SAMPLES;

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

  let world_normal = march_result.normal;
  let white = vec3f(1., 1., 1.);
  let mat_color = min(march_result.material.color, white);

  var albedo_luminance = convert_rgb_to_y(mat_color);
  var emission_luminance = 0.;
  if (march_result.material.emissive) {
    emission_luminance = convert_rgb_to_y(mat_color);
    // albedo_luminance = 0;
  }

  // var seed = GlobalInvocationID.x + GlobalInvocationID.y * WIDTH + GlobalInvocationID.z * WIDTH * HEIGHT;

  let view_normal = vec2f(world_normal.x, world_normal.y);

  let aux = vec4(
    view_normal.xy,
    albedo_luminance,
    emission_luminance
  );

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}

