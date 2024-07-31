import { WGSLRuntime, ptr, wgsl } from 'typegpu';
import { roundUpToPowerOfTwo } from '../mathUtils';
import { $camera, constructRayDir, constructRayPos } from './camera';
import { ShapeContext } from './worldSdf';
import { MarchResult, march } from './marchSdf';

// const marchThemCones = wgsl.fun();

const BlockSize = 8;

// prettier-ignore
const coneDist = wgsl.fun([ptr(ShapeContext)])((ctx) => wgsl`
  let d_march = (*${ctx}).ray_distance;

  return 
`);

const marchWithCone = march;

const ConeTracerCode = wgsl`
@compute @workgroup_size(${BlockSize}, ${BlockSize})
fn main(
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let offset = vec2f(
    0.5,
    0.5,
  );

  var march_result: ${MarchResult};
  var shape_ctx: ${ShapeContext};
  shape_ctx.ray_pos = ${constructRayPos()};
  shape_ctx.ray_dir = ${constructRayDir(
    'vec2f(GlobalInvocationID.xy) + offset',
  )};
  shape_ctx.ray_distance = 0.;

  ${marchWithSurfaceDist(
    'ray_pos',
    'MAX_STEPS',
    '&shape_ctx',
    '&march_result',
  )};

  var world_normal: vec3f;

  if (march_result.steps >= MAX_STEPS) {
    world_normal = -ray_dir;
  }
  else {
    world_normal = world_normals(march_result.position, shape_ctx);
  }

  var material: ${Material};
  ${worldMat}(march_result.position, shape_ctx, &material);

  let white = vec3f(1., 1., 1.);
  let mat_color = min(material.albedo, white);

  var albedo_luminance = convert_rgb_to_y(mat_color);
  var emission_luminance = 0.;
  if (material.emissive) {
    emission_luminance = albedo_luminance;
  }

  let view_normal = ${$camera}.view_matrix * vec4f(world_normal, 0);

  let aux = vec4(
    view_normal.xy,
    albedo_luminance,
    emission_luminance
  );

  // TODO: maybe apply gamma correction to the albedo luminance parameter??

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}
`;

class ConeTracer {
  private _paddedResolution: [number, number];
  private _quarterBuffer: GPUBuffer;

  constructor(device: GPUDevice, private _targetResolution: [number, number]) {
    this._paddedResolution = [
      roundUpToPowerOfTwo(_targetResolution[0]),
      roundUpToPowerOfTwo(_targetResolution[1]),
    ];

    this._quarterBuffer = device.createBuffer({
      label: 'Quarter Buffer',
      size:
        this._paddedResolution[0] *
        this._paddedResolution[1] *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  perform(runtime: WGSLRuntime) {
    runtime.device.queue.w;
  }
}

export default ConeTracer;
