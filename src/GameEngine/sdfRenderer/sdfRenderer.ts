import wgsl, { type TypeGpuRuntime } from 'typegpu';
import { f32, struct, vec3f } from 'typegpu/data';
import type { GBuffer } from '../../gBuffer';
import {
  cameraUniform,
  Camera,
  constructRayDir,
  constructRayPos,
} from './camera';
import { randOnHemisphere, setupRandomSeed } from '../wgslUtils/random';
import worldSdf, {
  randomSeedPrimerBuffer,
  timeBuffer,
  Material,
  RenderTargetHeight,
  RenderTargetWidth,
  ShapeContext,
  skyColor,
  surfaceDist,
  worldMat,
  randomSeedPrimerUniform,
} from './worldSdf';
import { ONES_3F } from '../wgslUtils/mathConstants';
import { MAX_STEPS, MarchResult, march } from './marchSdf';
import { convertRgbToY } from './colorUtils';

// parameters
const OutputFormat = wgsl.slot().$name('output_format');
const BlockSize = wgsl.slot().$name('block_size');
const WhiteNoiseBufferSize = wgsl.slot().$name('white_noise_buffer_size');

const SUPER_SAMPLES = 2;
const ONE_OVER_SUPER_SAMPLES = 1 / SUPER_SAMPLES;
const SUB_SAMPLES = 16;
const MAX_REFL = 3;

const Reflection = struct({
  color: vec3f,
  roughness: f32,
}).$name('reflection');

const marchWithSurfaceDist = march(surfaceDist).$name(
  'march_with_surface_dist',
);

/**
 * Reflecting: 𝑟=𝑑−2(𝑑⋅𝑛)𝑛
 * @param ray_dir
 * @param normal
 * @param mat_roughness
 */
const reflect = wgsl.fn()`(ray_dir: vec3f, normal: vec3f, mat_roughness: f32, out_roughness: ptr<function, f32>) -> vec3f {
  let slope = dot(ray_dir, normal);
  let dn2 = 2. * slope;
  let refl_dir = ray_dir - dn2 * normal;

  let fresnel = 1. - pow(1. + slope, 16.);
  let roughness = mat_roughness * fresnel;
  *out_roughness = roughness;

  var new_ray_dir = ${randOnHemisphere}(normal);
  new_ray_dir = mix(refl_dir, new_ray_dir, roughness);
  return normalize(new_ray_dir);
}`;

const worldNormals = wgsl.fn()`(point: vec3f, ctx: ${ShapeContext}) -> vec3f {
  let epsilon = ${surfaceDist}(ctx) * 0.1; // arbitrary - should be smaller than any surface detail in your distance function, but not so small as to get lost in float precision
  let offX = vec3f(point.x + epsilon, point.y, point.z);
  let offY = vec3f(point.x, point.y + epsilon, point.z);
  let offZ = vec3f(point.x, point.y, point.z + epsilon);
  
  let centerDistance = ${worldSdf}(point);
  let xDistance = ${worldSdf}(offX);
  let yDistance = ${worldSdf}(offY);
  let zDistance = ${worldSdf}(offZ);

  return normalize(vec3f(
    (xDistance - centerDistance),
    (yDistance - centerDistance),
    (zDistance - centerDistance),
  ) / epsilon);
}`.$name('world_normals');

const renderSubPixel = wgsl.fn()`(coord: vec2f) -> vec3f {
  /// doing the first march before each sub-sample, since the first march result is the same for all of them

  var init_shape_ctx: ${ShapeContext};
  init_shape_ctx.ray_pos = ${constructRayPos}();
  init_shape_ctx.ray_dir = ${constructRayDir}(coord);
  init_shape_ctx.ray_distance = 0.;
  var init_march_result: ${MarchResult};

  ${marchWithSurfaceDist}(&init_shape_ctx, ${MAX_STEPS}, &init_march_result);

  if (init_march_result.steps >= ${MAX_STEPS}) {
    return min(${skyColor}(init_shape_ctx.ray_dir), ${ONES_3F});
  }

  var normal = ${worldNormals}(init_march_result.position, init_shape_ctx);

  var init_material: ${Material};
  ${worldMat}(init_march_result.position, init_shape_ctx, &init_material);

  if (init_material.emissive) {
    return min(init_material.albedo, ${ONES_3F});
  }

  var reflections: array<${Reflection}, ${MAX_REFL}>;
  
  var acc = vec3f(0., 0., 0.);
  for (var sub = 0u; sub < ${SUB_SAMPLES}; sub++) {
    var material: ${Material} = init_material;

    var emissive_color = vec3f(0., 0., 0.);
    var refl_count = 0u;

    var shape_ctx: ${ShapeContext};
    shape_ctx.ray_pos = init_march_result.position;
    shape_ctx.ray_dir = init_shape_ctx.ray_dir;
    shape_ctx.ray_distance = init_shape_ctx.ray_distance;

    for (var refl = 0u; refl < ${MAX_REFL}; refl++) {
      var roughness: f32 = 0.;
      shape_ctx.ray_dir = ${reflect}(
        shape_ctx.ray_dir,
        normal,
        material.roughness,
        &roughness,
      );
      reflections[refl_count].color = material.albedo;
      reflections[refl_count].roughness = roughness;
      refl_count++;

      var march_result: ${MarchResult};
      ${marchWithSurfaceDist}(&shape_ctx, ${MAX_STEPS}, &march_result);
      shape_ctx.ray_pos = march_result.position;

      if (march_result.steps >= ${MAX_STEPS}) {
        emissive_color = ${skyColor}(shape_ctx.ray_dir);
        break;
      }

      normal = ${worldNormals}(shape_ctx.ray_pos, shape_ctx);

      ${worldMat}(shape_ctx.ray_pos, shape_ctx, &material);

      if (material.emissive) {
        emissive_color = material.albedo;
        break;
      }
    }

    var sub_acc = emissive_color;
    for (var i = i32(refl_count) - 1; i >= 0; i--) {
      let mat_color = reflections[i].color;
      let reflectivity = 1. - reflections[i].roughness;

      sub_acc *= mix(mat_color, ${ONES_3F}, max(0., min(reflectivity, 1.))); // absorb the ray color based on reflectivity
    }

    acc += sub_acc;
  }

  // averaging
  acc /= f32(${SUB_SAMPLES});

  // clipping
  acc = min(acc, ${ONES_3F});

  return acc;
}`.$name('render_sub_pixel');

const externalDeclarations = (outputFormat: string) => [
  wgsl`@group(0) @binding(0) var output_tex: texture_storage_2d<${outputFormat}, write>;`,
];

const mainComputeFn = wgsl.fn()`(LocalInvocationID: vec3u, GlobalInvocationID: vec3u) {
  ${setupRandomSeed}(vec2f(GlobalInvocationID.xy) * 10. + ${randomSeedPrimerUniform} * 1234.);

  var acc = vec3f(0., 0., 0.);
  for (var sx = 0u; sx < ${SUPER_SAMPLES}; sx++) {
    for (var sy = 0u; sy < ${SUPER_SAMPLES}; sy++) {
      let offset = vec2f(
        (f32(sx) + 0.5) * ${ONE_OVER_SUPER_SAMPLES},
        (f32(sy) + 0.5) * ${ONE_OVER_SUPER_SAMPLES},
      );

      acc += ${renderSubPixel}(vec2f(GlobalInvocationID.xy) + offset);
    }
  }

  acc *= ${ONE_OVER_SUPER_SAMPLES} * ${ONE_OVER_SUPER_SAMPLES};

  // applying gamma correction
  let gamma = 2.2;
  acc = pow(acc, vec3(1.0 / gamma));

  textureStore(output_tex, GlobalInvocationID.xy, vec4(acc, 1.0));
}`.$name('main_compute');

const auxComputeFn = wgsl.fn()`(LocalInvocationID: vec3<u32>, GlobalInvocationID: vec3<u32>) {
  let offset = vec2f(
    0.5,
    0.5,
  );
  
  var march_result: ${MarchResult};
  var shape_ctx: ${ShapeContext};
  shape_ctx.ray_pos = ${constructRayPos}();
  shape_ctx.ray_dir = ${constructRayDir}(
    vec2f(GlobalInvocationID.xy) + offset
  );
  shape_ctx.ray_distance = 0.;

  ${marchWithSurfaceDist}(&shape_ctx, ${MAX_STEPS}, &march_result);

  var world_normal: vec3f;

  if (march_result.steps >= ${MAX_STEPS}) {
    world_normal = -shape_ctx.ray_dir;
  }
  else {
    world_normal = ${worldNormals}(march_result.position, shape_ctx);
  }

  var material: ${Material};
  ${worldMat}(march_result.position, shape_ctx, &material);

  let white = vec3f(1., 1., 1.);
  let mat_color = min(material.albedo, white);

  var albedo_luminance = ${convertRgbToY}(mat_color);
  var emission_luminance = 0.;
  if (material.emissive) {
    emission_luminance = albedo_luminance;
  }

  let view_normal = ${cameraUniform}.view_matrix * vec4f(world_normal, 0);

  let aux = vec4(
    view_normal.xy,
    albedo_luminance,
    emission_luminance
  );

  // TODO: maybe apply gamma correction to the albedo luminance parameter??

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}`;

export const SDFRenderer = async (
  runtime: TypeGpuRuntime,
  gBuffer: GBuffer,
  renderQuarter: boolean,
) => {
  const LABEL = 'SDF Renderer';
  const blockDim = 8;
  const whiteNoiseBufferSize = 512 * 512;
  const mainPassSize = renderQuarter ? gBuffer.quarterSize : gBuffer.size;

  const camera = new Camera();

  const mainBindGroupLayout = runtime.device.createBindGroupLayout({
    label: `${LABEL} - Main Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: 'rgba8unorm',
        },
      },
    ],
  });

  const auxBindGroupLayout = runtime.device.createBindGroupLayout({
    label: `${LABEL} - Aux Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: 'rgba16float',
        },
      },
    ],
  });

  const mainBindGroup = runtime.device.createBindGroup({
    label: `${LABEL} - Main Bind Group`,
    layout: mainBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: renderQuarter ? gBuffer.quarterView : gBuffer.rawRenderView,
      },
    ],
  });

  const auxBindGroup = runtime.device.createBindGroup({
    label: `${LABEL} - Aux Bind Group`,
    layout: auxBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.auxView,
      },
    ],
  });

  const mainPipeline = runtime.makeComputePipeline({
    label: `${LABEL} - main`,
    workgroupSize: [blockDim, blockDim],
    args: [
      '@builtin(local_invocation_id) LocalInvocationID: vec3<u32>',
      '@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>',
    ],
    code: wgsl`
      ${mainComputeFn}(LocalInvocationID, GlobalInvocationID);
    `
      // filling slots
      .with(OutputFormat, 'rgba8unorm')
      .with(RenderTargetWidth, mainPassSize[0])
      .with(RenderTargetHeight, mainPassSize[1])
      .with(BlockSize, blockDim)
      .with(WhiteNoiseBufferSize, whiteNoiseBufferSize),
    // ---
    externalLayouts: [mainBindGroupLayout],
    externalDeclarations: externalDeclarations('rgba8unorm'),
  });

  const auxPipeline = runtime.makeComputePipeline({
    label: `${LABEL} - aux`,
    workgroupSize: [blockDim, blockDim],
    args: [
      '@builtin(local_invocation_id) LocalInvocationID: vec3<u32>',
      '@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>',
    ],
    code: wgsl`
      ${auxComputeFn}(LocalInvocationID, GlobalInvocationID);
    `
      // filling slots
      .with(OutputFormat, 'rgba16float')
      .with(RenderTargetWidth, gBuffer.size[0])
      .with(RenderTargetHeight, gBuffer.size[1])
      .with(BlockSize, blockDim)
      .with(WhiteNoiseBufferSize, whiteNoiseBufferSize),
    // ---
    externalLayouts: [auxBindGroupLayout],
    externalDeclarations: externalDeclarations('rgba16float'),
  });

  return {
    perform() {
      runtime.writeBuffer(timeBuffer, Date.now() % 100000);
      runtime.writeBuffer(randomSeedPrimerBuffer, Math.random());
      camera.update(runtime);

      mainPipeline.execute({
        workgroups: [
          Math.ceil(mainPassSize[0] / blockDim),
          Math.ceil(mainPassSize[1] / blockDim),
        ],
        externalBindGroups: [mainBindGroup],
      });

      auxPipeline.execute({
        workgroups: [
          Math.ceil(gBuffer.size[0] / blockDim),
          Math.ceil(gBuffer.size[1] / blockDim),
        ],
        externalBindGroups: [auxBindGroup],
      });
    },
  };
};
