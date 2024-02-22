import {
  ProgramBuilder,
  wgsl,
  u32,
  struct,
  vec4f,
  WGSLRuntime,
  f32,
  makeArena,
  dynamicArrayOf,
} from 'wigsill';
import { Parsed } from 'typed-binary';

// parameters
const OutputFormat = wgsl.param('output_format');
const BlockSize = wgsl.param('block_size');
const WhiteNoiseBufferSize = wgsl.param('white_noise_buffer_size');

type SphereStruct = Parsed<typeof SphereStruct>;
const SphereStruct = struct({
  xyzr: vec4f,
  material_idx: u32,
}).alias('SphereStruct');

const $time = wgsl.memory(f32).alias('Time info');
const $sceneSpheres = wgsl
  .memory(dynamicArrayOf(SphereStruct, MAX_SPHERES).alias('SphereArray'))
  .alias('Scene spheres');

const $camera = wgsl.memory(CameraStruct).alias('Main Camera');

// TEST
// const nameMap = new WeakMap<any, string>();
// function nameFor(value: unknown): string {
//   if (nameMap.has(value)) {
//     return nameMap.get(value)!;
//   }

//   const name = `#${Math.random()}`;
//   nameMap.set(value, name);
//   return name;
// }
// TEST

const sceneMemoryArena = makeArena({
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  bufferBindingType: 'uniform',
  minSize: 2144,
  memoryEntries: [$time, $camera, $sceneSpheres],
});

const MainShaderCode = wgsl.code`

struct MarchResult {
  position: vec3f,
  material: ${Material},
  normal: vec3f,
}

const MAX_STEPS = 100;
const SUPER_SAMPLES = 2;
const SUB_SAMPLES = 16;
const MAX_REFL = 3u;
const FAR = 100.;

@group(0) @binding(0) var output_tex: texture_storage_2d<${OutputFormat}, write>;

fn convert_rgb_to_y(rgb: vec3f) -> f32 {
  return 16./255. + (64.738 * rgb.r + 129.057 * rgb.g + 25.064 * rgb.b) / 255.;
}

// -- SDF

fn world_normals(point: vec3f, ctx: ${ShapeContext}) -> vec3f {
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
}

fn construct_ray(coord: vec2f, out_pos: ptr<function, vec3f>, out_dir: ptr<function, vec3f>) {
  var dir = vec4f(
    (coord / vec2f(${RenderTargetWidth}, ${RenderTargetHeight})) * 2. - 1.,
    1.,
    0.
  );

  let hspan = 1.;
  let vspan = 1.;

  dir.x *= hspan;
  dir.y *= -vspan;

  let inv_view_matrix = ${$camera}.inv_view_matrix;
  *out_pos = (inv_view_matrix * vec4f(0, 0, 0, 1)).xyz;
  *out_dir = normalize((inv_view_matrix * dir).xyz);
}

fn march(ray_pos: vec3f, ray_dir: vec3f, ctx: ptr<function, ${ShapeContext}>, out: ptr<function, MarchResult>) {
  var pos = ray_pos;
  var prev_dist = -1.;
  var min_dist = FAR;

  prev_dist = -1.;
  var progress = 0.;

  for (var step = 0u; step <= MAX_STEPS; step++) {
    pos = ray_pos + ray_dir * progress;
    min_dist = ${worldSdf}(pos);

    // Inside volume?
    if (min_dist <= 0. && prev_dist > 0.) {
      // No need to check more objects.
      break;
    }

    if (min_dist < ${surfaceDist}(*ctx) && min_dist < prev_dist) {
      // No need to check more objects.
      break;
    }

    // march forward safely
    progress += min_dist;
    (*ctx).ray_distance += min_dist;

    prev_dist = min_dist;
  }

  (*out).position = pos;

  // Not near surface or distance rising?
  if (min_dist > ${surfaceDist}(*ctx) * 2. || min_dist > prev_dist)
  {
    // Sky
    (*out).material.albedo = ${skyColor}(ray_dir);
    (*out).material.emissive = true;
    (*out).normal = -ray_dir;
    return;
  }

  var material: ${Material};
  ${worldMat}(pos, *ctx, &material);
  (*out).material = material;
  (*out).normal = world_normals(pos, *ctx);
}

@compute @workgroup_size(${BlockSize}, ${BlockSize}, 1)
fn main_frag(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  let parallel_idx = LocalInvocationID.y * ${BlockSize} + LocalInvocationID.x;

  ${setupRandomSeed}(vec2f(GlobalInvocationID.xy) + ${$time} * 0.312);

  var acc = vec3f(0., 0., 0.);
  var march_result: MarchResult;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  for (var sx = 0; sx < SUPER_SAMPLES; sx++) {
    for (var sy = 0; sy < SUPER_SAMPLES; sy++) {
      let offset = vec2f(
        (f32(sx) + 0.5) / SUPER_SAMPLES,
        (f32(sy) + 0.5) / SUPER_SAMPLES,
      );
      
      for (var ss = 0u; ss < SUB_SAMPLES; ss++) {
        construct_ray(vec2f(GlobalInvocationID.xy) + offset, &ray_pos, &ray_dir);
        
        var sub_acc = vec3f(1., 1., 1.);
        var shape_ctx: ${ShapeContext};
        shape_ctx.ray_distance = 0.;

        for (var refl = 0u; refl < MAX_REFL; refl++) {
          shape_ctx.ray_dir = ray_dir;
          march(ray_pos, ray_dir, &shape_ctx, &march_result);

          sub_acc *= march_result.material.albedo;
          // sub_acc *= march_result.normal;

          if (march_result.material.emissive) {
            break;
          }

          // Reflecting: 𝑟=𝑑−2(𝑑⋅𝑛)𝑛
          let dn2 = 2. * dot(ray_dir, march_result.normal);
          let refl_dir = ray_dir - dn2 * march_result.normal;

          ray_pos = march_result.position;
          ray_dir = ${randOnHemisphere}(march_result.normal);
          ray_dir = mix(refl_dir, ray_dir, march_result.material.roughness);
          ray_dir = normalize(ray_dir);
        }

        // clipping
        sub_acc = min(sub_acc, vec3f(1., 1., 1.));

        acc += sub_acc;
      }
    }
  }

  acc /= SUB_SAMPLES * SUPER_SAMPLES * SUPER_SAMPLES;

  textureStore(output_tex, GlobalInvocationID.xy, vec4(acc, 1.0));
}

@compute @workgroup_size(${BlockSize}, ${BlockSize})
fn main_aux(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  var ray_pos = vec3f(0, 0, 0);
  var ray_dir = vec3f(0, 0, 1);

  var march_result: MarchResult;

  let offset = vec2f(
    0.5,
    0.5,
  );
      
  construct_ray(vec2f(GlobalInvocationID.xy) + offset, &ray_pos, &ray_dir);

  var shape_ctx: ${ShapeContext};
  shape_ctx.ray_distance = 0.;

  march(ray_pos, ray_dir, &shape_ctx, &march_result);

  let world_normal = march_result.normal;
  let white = vec3f(1., 1., 1.);
  let mat_color = min(march_result.material.albedo, white);

  var albedo_luminance = convert_rgb_to_y(mat_color);
  var emission_luminance = 0.;
  if (march_result.material.emissive) {
    emission_luminance = albedo_luminance;
  }

  // TODO: Transform this normal into view-space
  let view_normal = vec2f(world_normal.x, world_normal.y);

  let aux = vec4(
    view_normal,
    albedo_luminance,
    emission_luminance
  );

  textureStore(output_tex, GlobalInvocationID.xy, aux);
}
`;

import { GBuffer } from '../../gBuffer';
import { MAX_SPHERES } from '../../schema/scene';
import { Camera, CameraStruct } from './camera';
import { randOnHemisphere, setupRandomSeed } from '../wgslUtils/random';
import worldSdf, {
  Material,
  RenderTargetHeight,
  RenderTargetWidth,
  ShapeContext,
  skyColor,
  surfaceDist,
  worldMat,
} from './worldSdf';

export const SDFRenderer = (
  device: GPUDevice,
  gBuffer: GBuffer,
  renderQuarter: boolean,
) => {
  const LABEL = `SDF Renderer`;
  const blockDim = 8;
  const whiteNoiseBufferSize = 512 * 512;
  const mainPassSize = renderQuarter ? gBuffer.quarterSize : gBuffer.size;

  const camera = new Camera($camera);

  const mainBindGroupLayout = device.createBindGroupLayout({
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

  const auxBindGroupLayout = device.createBindGroupLayout({
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

  const sceneSpheres: SphereStruct[] = [
    {
      xyzr: [-0.3, 0, 1, 0.2],
      material_idx: 1,
    },
    {
      xyzr: [0.4, 0, 1, 0.4],
      material_idx: 0,
    },
    {
      xyzr: [0, 0.7, 1, 0.2],
      material_idx: 2,
    },
  ];

  const mainBindGroup = device.createBindGroup({
    label: `${LABEL} - Main Bind Group`,
    layout: mainBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: renderQuarter ? gBuffer.quarterView : gBuffer.rawRenderView,
      },
    ],
  });

  const auxBindGroup = device.createBindGroup({
    label: `${LABEL} - Aux Bind Group`,
    layout: auxBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.auxView,
      },
    ],
  });

  const runtime = new WGSLRuntime(device);

  const mainProgram = new ProgramBuilder(runtime, MainShaderCode)
    // params
    .provide(OutputFormat, 'rgba8unorm')
    .provide(RenderTargetWidth, mainPassSize[0])
    .provide(RenderTargetHeight, mainPassSize[1])
    .provide(BlockSize, blockDim)
    .provide(WhiteNoiseBufferSize, whiteNoiseBufferSize)
    //
    .build({
      bindingGroup: 1,
      shaderStage: GPUShaderStage.COMPUTE,
      arenas: [sceneMemoryArena],
    });

  const mainPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [mainBindGroupLayout, mainProgram.bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Main Shader`,
        code: mainProgram.code,
      }),
      entryPoint: 'main_frag',
    },
  });

  const auxProgram = new ProgramBuilder(runtime, MainShaderCode)
    // params
    .provide(OutputFormat, 'rgba16float')
    .provide(RenderTargetWidth, gBuffer.size[0])
    .provide(RenderTargetHeight, gBuffer.size[1])
    .provide(BlockSize, blockDim)
    .provide(WhiteNoiseBufferSize, whiteNoiseBufferSize)
    //
    .build({
      bindingGroup: 1,
      shaderStage: GPUShaderStage.COMPUTE,
      arenas: [sceneMemoryArena],
    });

  const auxPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [auxBindGroupLayout, auxProgram.bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Aux Shader`,
        code: auxProgram.code,
      }),
      entryPoint: 'main_aux',
    },
  });

  $sceneSpheres.write(runtime, sceneSpheres);

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      $time.write(runtime, Date.now() % 1000);
      camera.update(runtime);

      const mainPass = commandEncoder.beginComputePass();

      mainPass.setPipeline(mainPipeline);
      mainPass.setBindGroup(0, mainBindGroup);
      mainPass.setBindGroup(1, mainProgram.bindGroup);
      mainPass.dispatchWorkgroups(
        Math.ceil(mainPassSize[0] / blockDim),
        Math.ceil(mainPassSize[1] / blockDim),
        1,
      );

      mainPass.end();

      const auxPass = commandEncoder.beginComputePass();

      auxPass.setPipeline(auxPipeline);
      auxPass.setBindGroup(0, auxBindGroup);
      auxPass.setBindGroup(1, auxProgram.bindGroup);
      auxPass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      auxPass.end();
    },
  };
};
