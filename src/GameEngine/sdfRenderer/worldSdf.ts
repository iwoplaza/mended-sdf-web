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

// prettier-ignore
export const surfaceDist = wgsl.fun([ShapeContext], f32)(
  (ctx) => wgsl`
    let dist_from_camera = ${ctx}.ray_distance;
    return dist_from_camera / ${RenderTargetHeight} * 0.1;
`);

// prettier-ignore
const objLeftBlob = wgsl.fun([vec3f], f32)((pos) => wgsl`
  return ${sdf.sphere(pos, 'vec3(-0.3, 0., -2.)', 0.2)};
`);

// prettier-ignore
const objCenterBlob = wgsl.fun([vec3f], f32)((pos) => wgsl`
  return ${sdf.sphere(pos, 'vec3(0., 0.7, -2.)', 0.2)};
`);

// prettier-ignore
const objRightBlob = wgsl.fun([vec3f], f32)((pos) => wgsl`
  return ${sdf.sphere(pos, 'vec3(0.4, 0., -2.)', 0.4)};
`);

// prettier-ignore
const objFloor = wgsl.fun([vec3f], f32)((pos) => wgsl`
  return ${pos}.y + 0.3;
`);

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
    (*out).albedo = vec3f(1., 1., 1.) * 20.;
    (*out).emissive = true;
  }
  else if (d_right_blob <= sd) {
    (*out).albedo = vec3f(0.5, 0.5, 0.6) * 0.9;
    (*out).roughness = 0.3;
  }
  else if (d_floor_blob <= sd) {
    (*out).albedo = vec3f(0.5, 0.5, 0.6) * 0.3;
    (*out).roughness = 0.9;
  }
  else {
    // (*out).albedo = vec3f(0.5, 0.5, 0.2);
    (*out).albedo = ${skyColor}(ctx.ray_dir);
  }
}`;

export default worldSdf;
