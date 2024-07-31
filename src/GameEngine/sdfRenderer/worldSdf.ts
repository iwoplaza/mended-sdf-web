import wgsl from 'typegpu';
import { f32, bool, struct, vec3f } from 'typegpu/data';
import { sdf } from './sdf';

export const RenderTargetWidth = wgsl.slot().$name('render_target_width');
export const RenderTargetHeight = wgsl.slot().$name('render_target_height');
export const timeBuffer = wgsl.buffer(f32).$name('time').$allowUniform();
export const timeUniform = timeBuffer.asUniform();
export const randomSeedPrimerBuffer = wgsl
  .buffer(f32)
  .$name('random_seed_primer')
  .$allowUniform();
export const randomSeedPrimerUniform = randomSeedPrimerBuffer.asUniform().$name('random_seed_primer_uniform');

export const ShapeContext = struct({
  ray_pos: vec3f,
  ray_dir: vec3f,
  ray_distance: f32,
}).$name('shape_context');

export const Material = struct({
  albedo: vec3f,
  roughness: f32,
  emissive: bool,
});

export const surfaceDist = wgsl.fn()`(ctx: ${ShapeContext}) -> f32 {
  let dist_from_camera = ctx.ray_distance;
  return dist_from_camera / ${RenderTargetHeight} * 0.01;
}`;

const objLeftBlob = wgsl.fn()`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(-0.3, -0.2, -2.), 0.2);
}`.$name('obj_left_blob');

const objCenterBlob = wgsl.fn()`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(0., 0.7, -2.), 0.2);
}`.$name('obj_center_blob');

const objRightBlob = wgsl.fn()`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(0.4, 0.2 + sin(${timeUniform} * 0.001) * 0.1, -2.), 0.4);
}`;

const objFloor = wgsl.fn()`(pos: vec3f) -> f32 {
  return pos.y + 0.3;
}`;

// biome-ignore format:
const matFloor = wgsl.fn()`(pos: vec3f, mtr: ptr<function, ${Material}>) {
  let uv = floor(5.0 * pos.xz);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));
  
  (*mtr).albedo = mix(vec3(1., 1., 1.), vec3(0., 0., 0.), c);
  (*mtr).roughness = 0.9;
}`.$name('mat_floor');

export const FAR = wgsl.constant('100.');

export const worldSdf = wgsl.fn('world_sdf')`(pos: vec3f) -> f32 {
  var min_dist = ${FAR};

  min_dist = min(min_dist, ${objLeftBlob}(pos));
  min_dist = min(min_dist, ${objCenterBlob}(pos));
  min_dist = min(min_dist, ${objRightBlob}(pos));
  min_dist = min(min_dist, ${objFloor}(pos));

  return min_dist;
}`;

// MATERIALS

export const skyColor = wgsl.fn('sky_color')`(dir: vec3f) -> vec3f {
  let t = pow(min(abs(dir.y) * 4, 1.), 0.4);
  
  let uv = floor(30.0 * dir.xy);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  return mix(
    vec3f(0.7, 0.7, 0.75), // horizon
    vec3f(0.35, 0.4, 0.6),
    t,
  );
}`;

export const worldMat = wgsl.fn(
  'world_mat',
)`(pos: vec3f, ctx: ${ShapeContext}, out: ptr<function, ${Material}>) {
  let sd = ${surfaceDist}(ctx);
  let d_left_blob = ${objLeftBlob}(pos);
  let d_center_blob = ${objCenterBlob}(pos);
  let d_right_blob = ${objRightBlob}(pos);
  let d_floor_blob = ${objFloor}(pos);

  // defaults
  (*out).emissive = false;
  (*out).roughness = 1.;

  if (d_left_blob <= sd) {
    // left blob
    (*out).albedo = vec3f(1., 0.2, 0.2);
    (*out).roughness = 0.95;
  }
  else if (d_center_blob <= sd) {
    // test light
    (*out).albedo = vec3f(1., 1., 1.) * 1.;
    (*out).emissive = true;
  }
  else if (d_right_blob <= sd) {
    (*out).albedo = vec3f(0.5, 0.5, 0.6) * 0.9;
    (*out).roughness = 0.1;
  }
  else if (d_floor_blob <= sd) {
    ${matFloor}(pos, out);
  }
  else {
    // (*out).albedo = vec3f(0.5, 0.5, 0.2);
    (*out).albedo = ${skyColor}(ctx.ray_dir);
  }
}`;

export default worldSdf;
