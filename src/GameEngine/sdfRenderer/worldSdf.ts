import { f32, bool, struct, vec3f, wgsl } from 'wigsill';
import { sdf } from './sdf';

export const RenderTargetWidth = wgsl.param('render_target_width');
export const RenderTargetHeight = wgsl.param('render_target_height');

export const ShapeContext = struct({
  ray_distance: f32,
  ray_dir: vec3f,
}).alias('Shape Context type');

export const Material = struct({
  albedo: vec3f,
  roughness: f32,
  emissive: bool,
});

export const surfaceDist = wgsl.fn(
  'surface_dist',
)`(ctx: ${ShapeContext}) -> f32 {
  let dist_from_camera = ctx.ray_distance;
  return dist_from_camera / ${RenderTargetHeight} * 1.;
}`;

const obj_left_blob = wgsl.fn('obj_left_blob')`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(-0.3, 0., 1.), 0.2);
}`;

const obj_center_blob = wgsl.fn('obj_center_blob')`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(0., 0.7, 1.), 0.2);
}`;

const obj_right_blob = wgsl.fn('obj_right_blob')`(pos: vec3f) -> f32 {
  return ${sdf.sphere}(pos, vec3(0.4, 0., 1.), 0.4);
}`;

export const FAR = wgsl.constant('100.');

export const worldSdf = wgsl.fn('world_sdf')`(pos: vec3f) -> f32 {
  var min_dist = ${FAR};

  min_dist = min(min_dist, ${obj_left_blob}(pos));
  min_dist = min(min_dist, ${obj_center_blob}(pos));
  min_dist = min(min_dist, ${obj_right_blob}(pos));

  return min_dist;
}`;

// MATERIALS

export const skyColor = wgsl.fn('sky_color')`(dir: vec3f) -> vec3f {
  let t = dir.y / 2. + 0.5;
  
  let uv = floor(30.0 * dir.xy);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  return mix(
    vec3f(0.1, 0.15, 0.5),
    vec3f(0.7, 0.9, 1),
    t,
  ) * mix(1., 0., c);
}`;

export const worldMat = wgsl.fn(
  'world_mat',
)`(pos: vec3f, ctx: ${ShapeContext}, out: ptr<function, ${Material}>) {
  let sd = ${surfaceDist}(ctx);
  let d_left_blob = ${obj_left_blob}(pos);
  let d_center_blob = ${obj_center_blob}(pos);
  let d_right_blob = ${obj_right_blob}(pos);

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
    (*out).albedo = vec3f(1., 1., 1.) * 20.;
    (*out).emissive = true;
  }
  else if (d_right_blob <= sd) {
    (*out).albedo = vec3f(0.5, 0.5, 0.6) * 0.9;
    (*out).roughness = 0.3;
  }
  else {
    // (*out).albedo = vec3f(0.5, 0.5, 0.2);
    (*out).albedo = ${skyColor}(ctx.ray_dir);
  }
}`;

export default worldSdf;

// let count = ${$sceneSpheres}.count;
// for (var idx = 0u; idx < count; idx++) {
//   let sphere_xyzr = ${$sceneSpheres}.values[idx].xyzr;
//   let obj_dist = ${sdf.sphere}(pos, sphere_xyzr.xyz, sphere_xyzr.w);

//   min_dist = min(obj_dist, min_dist);
// }
