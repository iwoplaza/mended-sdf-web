import {
  makeArena,
  ProgramBuilder,
  WGSLRuntime,
  wgsl,
  u32,
  f32,
  vec4f,
  struct,
  dynamicArrayOf,
  vec3f,
  vec2f,
  ptr,
} from 'wigsill';
import type { Parsed } from 'typed-binary';

// parameters
const OutputFormat = wgsl.param('output_format');
const BlockSize = wgsl.param('block_size');
const WhiteNoiseBufferSize = wgsl.param('white_noise_buffer_size');

type SphereStruct = Parsed<typeof SphereStruct>;
const SphereStruct = struct({
  xyzr: vec4f,
  material_idx: u32,
}).alias('SphereStruct');

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
  memoryEntries: [$time, $random_seed_primer, $camera, $sceneSpheres],
});

const constructRayDir = wgsl.fun(
  [vec2f],
  vec3f,
)(
  (coord) => wgsl`
  let viewport_size = vec2f(${RenderTargetWidth}, ${RenderTargetHeight});
  var view_coords = (${coord} - viewport_size / 2.) / ${RenderTargetHeight};

  var view_ray_dir = vec3f(
    view_coords,
    -1.,
  );
  view_ray_dir.y *= -1.;
  view_ray_dir = normalize(view_ray_dir);

  return view_ray_dir;
`,
);

const Reflection = struct({
  color: vec3f,
  roughness: f32,
});

const marchWithSurfaceDist = march(surfaceDist);

// prettier-ignore
/**
 * Reflecting: 𝑟=𝑑−2(𝑑⋅𝑛)𝑛
 * @param ray_dir
 * @param normal
 * @param mat_roughness
 */
const reflect = wgsl.fun([vec3f, vec3f, f32, ptr(f32)], vec3f)((ray_dir, normal, mat_roughness, out_roughness) => wgsl`
  let slope = dot(${ray_dir}, ${normal});
  let dn2 = 2. * slope;
  let refl_dir = ${ray_dir} - dn2 * ${normal};

  let fresnel = 1. - pow(1. + slope, 16.);
  let roughness = ${mat_roughness} * fresnel;
  *${out_roughness} = roughness;

  var ray_dir = ${randOnHemisphere(normal)};
  ray_dir = mix(refl_dir, ray_dir, roughness);
  return normalize(ray_dir);
`);

const renderSubPixel = wgsl.fun(
  [vec2f],
  vec3f,
)(
  (coord) => wgsl`
  var start_dir = ${constructRayDir(coord)};

  /// applying camera transform

  var start_pos = (${$camera}.inv_view_matrix * vec4f(0., 0., 0., 1.)).xyz;
  start_dir = (${$camera}.inv_view_matrix * vec4f(start_dir, 0.)).xyz;

  /// doing the first march before each sub-sample, since the first march result is the same for all of them

  var init_shape_ctx: ${ShapeContext};
  init_shape_ctx.ray_dir = start_dir;
  init_shape_ctx.ray_distance = 0.;
  var init_march_result: ${MarchResult};

  ${marchWithSurfaceDist(
    'start_pos',
    'MAX_STEPS',
    '&init_shape_ctx',
    '&init_march_result',
  )};

  if (init_march_result.steps >= MAX_STEPS) {
    return min(${skyColor}(start_dir), ${ONES_3F});
  }

  var normal = world_normals(init_march_result.position, init_shape_ctx);

  var init_material: ${Material};
  ${worldMat}(init_march_result.position, init_shape_ctx, &init_material);

  if (init_material.emissive) {
    return min(init_material.albedo, ${ONES_3F});
  }

  var reflections: array<${Reflection}, MAX_REFL>;
  
  var acc = vec3f(0., 0., 0.);
  for (var sub = 0u; sub < SUB_SAMPLES; sub++) {
    var ray_pos = init_march_result.position;
    var ray_dir = start_dir;
    var material: ${Material} = init_material;

    var emissive_color = vec3f(0., 0., 0.);
    var refl_count = 0u;

    var shape_ctx: ${ShapeContext};
    shape_ctx.ray_distance = init_shape_ctx.ray_distance;

    for (var refl = 0u; refl < MAX_REFL; refl++) {
      var roughness: f32 = 0.;
      ray_dir = ${reflect(
        'ray_dir',
        'normal',
        'material.roughness',
        '&roughness',
      )};;
      reflections[refl_count].color = material.albedo;
      reflections[refl_count].roughness = roughness;
      refl_count++;

      shape_ctx.ray_dir = ray_dir;
      var march_result: ${MarchResult};
      ${marchWithSurfaceDist(
        'ray_pos',
        'MAX_STEPS',
        '&shape_ctx',
        '&march_result',
      )};
      ray_pos = march_result.position;

      if (march_result.steps >= MAX_STEPS) {
        emissive_color = ${skyColor}(ray_dir);
        break;
      }

      normal = world_normals(ray_pos, shape_ctx);

      ${worldMat}(ray_pos, shape_ctx, &material);

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
  acc /= f32(SUB_SAMPLES);

  // clipping
  acc = min(acc, ${ONES_3F});

  return acc;
`,
);

const MainShaderCode = wgsl.code`

const MAX_STEPS = 500;
const SUPER_SAMPLES = 2;
const ONE_OVER_SUPER_SAMPLES = 1. / SUPER_SAMPLES;
const SUB_SAMPLES = 16;
const MAX_REFL = 3u;

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



@compute @workgroup_size(${BlockSize}, ${BlockSize}, 1)
fn main_frag(
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {

  ${setupRandomSeed}(vec2f(GlobalInvocationID.xy) * 10. + ${$random_seed_primer} * 1234.);

  var acc = vec3f(0., 0., 0.);
  for (var sx = 0u; sx < SUPER_SAMPLES; sx++) {
    for (var sy = 0u; sy < SUPER_SAMPLES; sy++) {
      let offset = vec2f(
        (f32(sx) + 0.5) * ONE_OVER_SUPER_SAMPLES,
        (f32(sy) + 0.5) * ONE_OVER_SUPER_SAMPLES,
      );

      acc += ${renderSubPixel('vec2f(GlobalInvocationID.xy) + offset')};
    }
  }

  acc *= ONE_OVER_SUPER_SAMPLES * ONE_OVER_SUPER_SAMPLES;

  // applying gamma correction
  let gamma = 2.2;
  acc = pow(acc, vec3(1.0 / gamma));

  textureStore(output_tex, GlobalInvocationID.xy, vec4(acc, 1.0));
}

@compute @workgroup_size(${BlockSize}, ${BlockSize})
fn main_aux(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  var ray_pos = vec3f(0, 0, 0);
  let offset = vec2f(
    0.5,
    0.5,
  );
  var ray_dir = ${constructRayDir('vec2f(GlobalInvocationID.xy) + offset')};

  // applying camera transform
  ray_pos = (${$camera}.inv_view_matrix * vec4f(ray_pos, 1.)).xyz;
  ray_dir = (${$camera}.inv_view_matrix * vec4f(ray_dir, 0.)).xyz;

  var march_result: ${MarchResult};
  var shape_ctx: ${ShapeContext};
  shape_ctx.ray_distance = 0.;
  shape_ctx.ray_dir = ray_dir;

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

import { GBuffer } from '../../gBuffer';
import { MAX_SPHERES } from '../../schema/scene';
import { Camera, CameraStruct } from './camera';
import { randOnHemisphere, setupRandomSeed } from '../wgslUtils/random';
import worldSdf, {
  $random_seed_primer,
  $time,
  Material,
  RenderTargetHeight,
  RenderTargetWidth,
  ShapeContext,
  skyColor,
  surfaceDist,
  worldMat,
} from './worldSdf';
import { ONES_3F } from '../wgslUtils/mathConstants';
import { MarchResult, march } from './marchSdf';

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
      $time.write(runtime, Date.now() % 100000);
      $random_seed_primer.write(runtime, Math.random());
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
