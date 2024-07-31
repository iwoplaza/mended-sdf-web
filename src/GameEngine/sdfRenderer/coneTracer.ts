import {
  type TypeGpuRuntime,
  wgsl,
  type WgslBuffer,
  type WgslPlum,
} from 'typegpu';
import {
  arrayOf,
  type F32,
  f32,
  vec2f,
  vec2u,
  type WgslArray,
} from 'typegpu/data';

import { roundUp } from '../mathUtils';
import { constructRayDir, constructRayPos } from './camera';
import { MarchResult } from './marchSdf';
import worldSdf, { FAR, ShapeContext } from './worldSdf';

const BlockSize = 8;

const coneMinDistVar = wgsl.var(f32, 0);

const coneDist = wgsl.fn()`(ctx: ${ShapeContext} -> f32 {
  return ${coneMinDistVar} * ctx.ray_distance;
}`.$name('cone_dist');

const marchWithCone = wgsl.fn()`(ctx: ptr<function, ShapeContext>, limit: u32) {
  let dir = (*ctx).ray_dir;
  let start_pos = (*ctx).ray_pos;
  
  for (var step = 0u; step <= limit; step++) {
    if ((*ctx).ray_distance >= ${FAR}) {
      // Stop checking.
      return;
    }

    let min_dist = ${worldSdf}(start_pos + (*ctx).ray_distance * dir);

    // March forward
    (*ctx).ray_distance += min_dist;

    // Crossed threshold?
    if (min_dist <= ${coneDist}(*ctx)) {
      // Stop checking.
      (*ctx).ray_distance -= min_dist; // going back
      return;
    }
  }
}`.$name('march_with_cone');

const inputBufferSizePlaceholder = wgsl.slot().$name('input_buffer_size');
const outputBufferSizePlaceholder = wgsl.slot().$name('output_buffer_size');
const isFirstStep = wgsl.slot().$name('is_first_step');
const inputBufferPlaceholder = wgsl.slot().$name('input_buffer');
const outputBufferSlot = wgsl.slot().$name('output_buffer');

const renderTargetSizeSlot = wgsl.slot().$name('render_target_size');

const depth16SizeBuffer = wgsl.buffer(vec2u).$allowUniform();
const depth8SizeBuffer = wgsl.buffer(vec2u).$allowUniform();
const depth4SizeBuffer = wgsl.buffer(vec2u).$allowUniform();
const depth2SizeBuffer = wgsl.buffer(vec2u).$allowUniform();
// can be fractional, as this is the divided resolution without any padding
const resolution16Buffer = wgsl.buffer(vec2f).$allowUniform();
const resolution8Buffer = wgsl.buffer(vec2f).$allowUniform();
const resolution4Buffer = wgsl.buffer(vec2f).$allowUniform();
const resolution2Buffer = wgsl.buffer(vec2f).$allowUniform();

// const MAX_STEPS = 100;

const mainComputeFn = wgsl.fn()`(GlobalInvocationID: vec3u) {
  let offset = vec2f(
    0.5,
    0.5
  );

  var march_result: ${MarchResult};
  var shape_ctx: ${ShapeContext};
  shape_ctx.ray_pos = ${constructRayPos}();
  shape_ctx.ray_dir = ${constructRayDir}(vec2f(GlobalInvocationID.xy) + offset);
  shape_ctx.ray_distance = 0.;

  // TODO: A very primitive estimation, change for a better approx if needed.
  ${coneMinDistVar} = ${Math.SQRT2} / ${renderTargetSizeSlot}.y;

  if (!${isFirstStep}) {
    // Advancing based on the previous step

    let prev_idx = u32(GlobalInvocationID.x / 2) + u32(GlobalInvocationID.y / 2 * ${inputBufferSizePlaceholder}.x);
    let prev_dist = ${inputBufferPlaceholder}[prev_idx];
    shape_ctx.ray_distance = prev_dist;
  }
  
  ${marchWithCone}(&shape_ctx, MAX_STEPS);

  let buffer_offset = GlobalInvocationID.x + GlobalInvocationID.y * ${outputBufferSizePlaceholder}.x;
  ${outputBufferSlot}[buffer_offset] = shape_ctx.ray_distance;
}`.$name('main_compute_fn');

export interface CBuffer {
  readonly modulo: number;

  depth16BufferPlum: WgslPlum<WgslBuffer<WgslArray<F32>, 'mutable_storage'>>;
  depth8BufferPlum: WgslPlum<WgslBuffer<WgslArray<F32>, 'mutable_storage'>>;
  depth4BufferPlum: WgslPlum<WgslBuffer<WgslArray<F32>, 'mutable_storage'>>;
  depth2BufferPlum: WgslPlum<WgslBuffer<WgslArray<F32>, 'mutable_storage'>>;

  depth16SizePlum: WgslPlum<[number, number]>;
  depth8SizePlum: WgslPlum<[number, number]>;
  depth4SizePlum: WgslPlum<[number, number]>;
  depth2SizePlum: WgslPlum<[number, number]>;
}

export const makeCBuffer = (
  resolutionPlum: WgslPlum<[number, number]>,
): CBuffer => {
  const modulo = 16 as const;

  const paddedResolutionPlum = wgsl.plum((get) => {
    const res = get(resolutionPlum);
    return [
      // Rounding up to multiples of `modulo` since we divide the resolution by at most `modulo`
      roundUp(res[0], modulo),
      roundUp(res[1], modulo),
    ] as [number, number];
  });

  const depth16SizePlum = wgsl.plum((get) => {
    const res = get(paddedResolutionPlum);
    return [
      // making the buffers padded to accommodate for block size
      roundUp(res[0] / 16, BlockSize),
      roundUp(res[1] / 16, BlockSize),
    ] as [number, number];
  });

  const depth8SizePlum = wgsl.plum((get) => {
    const res = get(paddedResolutionPlum);
    // making the buffers padded to accommodate for block size
    return [roundUp(res[0] / 8, BlockSize), roundUp(res[1] / 8, BlockSize)] as [
      number,
      number,
    ];
  });

  const depth4SizePlum = wgsl.plum((get) => {
    const res = get(paddedResolutionPlum);
    // making the buffers padded to accommodate for block size
    return [roundUp(res[0] / 4, BlockSize), roundUp(res[1] / 4, BlockSize)] as [
      number,
      number,
    ];
  });

  const depth2SizePlum = wgsl.plum((get) => {
    const res = get(paddedResolutionPlum);
    // making the buffers padded to accommodate for block size
    return [roundUp(res[0] / 2, BlockSize), roundUp(res[1] / 2, BlockSize)] as [
      number,
      number,
    ];
  });

  return {
    modulo,

    depth16SizePlum,
    depth8SizePlum,
    depth4SizePlum,
    depth2SizePlum,

    depth16BufferPlum: wgsl.plum((get) => {
      const res = get(depth16SizePlum);

      return wgsl
        .buffer(arrayOf(f32, res[0] * res[1]))
        .$allowMutableStorage()
        .$name('1/16 depth buffer');
    }),

    depth8BufferPlum: wgsl.plum((get) => {
      const res = get(depth8SizePlum);

      return wgsl
        .buffer(arrayOf(f32, res[0] * res[1]))
        .$allowMutableStorage()
        .$name('1/8 depth buffer');
    }),

    depth4BufferPlum: wgsl.plum((get) => {
      const res = get(depth4SizePlum);

      return wgsl
        .buffer(arrayOf(f32, res[0] * res[1]))
        .$allowMutableStorage()
        .$name('1/4 depth buffer');
    }),

    depth2BufferPlum: wgsl.plum((get) => {
      const res = get(depth2SizePlum);

      return wgsl
        .buffer(arrayOf(f32, res[0] * res[1]))
        .$allowMutableStorage()
        .$name('1/2 depth buffer');
    }),
  };
};

export type ConeTracerOptions = {
  runtime: TypeGpuRuntime;
  resolutionPlum: WgslPlum<[number, number]>;
  cBuffer: CBuffer;
};

const ConeTracer = ({ runtime, cBuffer }: ConeTracerOptions) => {
  const cone16Program = wgsl.plum((get) => {
    return runtime.makeComputePipeline({
      label: 'Cone Tracer - 1/16 pipeline',
      args: ['@builtin(global_invocation_id) GlobalInvocationID: vec3u'],
      workgroupSize: [BlockSize, BlockSize],
      code: wgsl`
        ${mainComputeFn}(GlobalInvocationID);
      `
        // filling slots
        .with(isFirstStep, 'true')
        .with(inputBufferSizePlaceholder, depth2SizeBuffer.asUniform())
        .with(outputBufferSizePlaceholder, depth16SizeBuffer.asUniform())
        .with(inputBufferPlaceholder, get(cBuffer.depth2BufferPlum).asStorage())
        .with(outputBufferSlot, get(cBuffer.depth16BufferPlum).asStorage())
        .with(renderTargetSizeSlot, resolution16Buffer.asUniform()),
    });
  });

  const cone8Program = wgsl.plum((get) => {
    return runtime.makeComputePipeline({
      label: 'Cone Tracer - 1/8 pipeline',
      args: ['@builtin(global_invocation_id) GlobalInvocationID: vec3u'],
      workgroupSize: [BlockSize, BlockSize],
      code: wgsl`
        ${mainComputeFn}(GlobalInvocationID);
      `
        // filling slots
        .with(isFirstStep, 'false')
        .with(inputBufferSizePlaceholder, depth16SizeBuffer.asUniform())
        .with(outputBufferSizePlaceholder, depth8SizeBuffer.asUniform())
        .with(
          inputBufferPlaceholder,
          get(cBuffer.depth16BufferPlum).asStorage(),
        )
        .with(outputBufferSlot, get(cBuffer.depth8BufferPlum).asStorage())
        .with(renderTargetSizeSlot, resolution8Buffer.asUniform()),
    });
  });

  const cone4Program = wgsl.plum((get) => {
    return runtime.makeComputePipeline({
      label: 'Cone Tracer - 1/4 pipeline',
      args: ['@builtin(global_invocation_id) GlobalInvocationID: vec3u'],
      workgroupSize: [BlockSize, BlockSize],
      code: wgsl`
        ${mainComputeFn}(GlobalInvocationID);
      `
        // filling slots
        .with(isFirstStep, 'false')
        .with(inputBufferSizePlaceholder, depth8SizeBuffer.asUniform())
        .with(outputBufferSizePlaceholder, depth4SizeBuffer.asUniform())
        .with(inputBufferPlaceholder, get(cBuffer.depth8BufferPlum).asStorage())
        .with(outputBufferSlot, get(cBuffer.depth4BufferPlum).asStorage())
        .with(renderTargetSizeSlot, resolution4Buffer.asUniform()),
    });
  });

  const cone2Program = wgsl.plum((get) => {
    return runtime.makeComputePipeline({
      label: 'Cone Tracer - 1/2 pipeline',
      args: ['@builtin(global_invocation_id) GlobalInvocationID: vec3u'],
      workgroupSize: [BlockSize, BlockSize],
      code: wgsl`
        ${mainComputeFn}(GlobalInvocationID);
      `
        // filling slots
        .with(isFirstStep, false)
        .with(inputBufferSizePlaceholder, depth4SizeBuffer.asUniform())
        .with(outputBufferSizePlaceholder, depth2SizeBuffer.asUniform())
        .with(inputBufferPlaceholder, get(cBuffer.depth4BufferPlum).asStorage())
        .with(outputBufferSlot, get(cBuffer.depth2BufferPlum).asStorage())
        .with(renderTargetSizeSlot, resolution2Buffer.asUniform()),
    });
  });

  return {
    perform() {
      const depth16Size = runtime.readPlum(cBuffer.depth16SizePlum);
      const depth8Size = runtime.readPlum(cBuffer.depth8SizePlum);
      const depth4Size = runtime.readPlum(cBuffer.depth4SizePlum);
      const depth2Size = runtime.readPlum(cBuffer.depth2SizePlum);

      const opts = ([x, y]: [number, number]) => ({
        workgroups: [
          Math.ceil(x / BlockSize),
          Math.ceil(y / BlockSize),
        ] as const,
      });

      runtime.readPlum(cone16Program).execute(opts(depth16Size));
      runtime.readPlum(cone8Program).execute(opts(depth8Size));
      runtime.readPlum(cone4Program).execute(opts(depth4Size));
      runtime.readPlum(cone2Program).execute(opts(depth2Size));
    },
  };
};

export default ConeTracer;
