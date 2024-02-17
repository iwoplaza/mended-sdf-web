import {
  ProgramBuilder,
  wgsl,
  u32,
  object,
  vec4f,
  arrayOf,
  WGSLRuntime,
} from 'wigsill';
import { BufferWriter, MaxValue, Parsed } from 'typed-binary';
import { sdf } from './sdf';

const OutputFormat = wgsl.param('output_format');
const RenderTargetWidth = wgsl.param('render_target_width');
const RenderTargetHeight = wgsl.param('render_target_height');
const BlockSize = wgsl.param('block_size');
const WhiteNoiseBufferSize = wgsl.param('white_noise_buffer_size');

const MainShaderCode = wgsl.code`
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
const WIDTH = ${RenderTargetWidth};
const HEIGHT = ${RenderTargetHeight};
const BLOCK_SIZE = ${BlockSize};
const PI = 3.14159265359;
const PI2 = 2. * PI;
const MAX_STEPS = 1000;
const SURFACE_DIST = 0.0001;
const SUPER_SAMPLES = 2;
const SUB_SAMPLES = 32;
const MAX_REFL = 3u;
const FAR = 100.;

const VEC3F_MAX = vec3f(1., 1., 1.);

@group(0) @binding(0) var<storage, read> white_noise_buffer: array<f32, ${WhiteNoiseBufferSize}>;
@group(0) @binding(1) var<uniform> time: f32;

@group(1) @binding(0) var output_tex: texture_storage_2d<${OutputFormat}, write>;

@group(2) @binding(0) var<storage, read> scene_info: SceneInfo;
@group(2) @binding(1) var<storage, read> view_matrix: mat4x4<f32>;
@group(2) @binding(2) var<storage, read> domains: array<MarchDomain>;
@group(2) @binding(3) var<storage, read> scene_spheres: array<SphereObj>;

fn convert_rgb_to_y(rgb: vec3f) -> f32 {
  return 16./255. + (64.738 * rgb.r + 129.057 * rgb.g + 25.064 * rgb.b) / 255.;
}

// -- SDF

fn world_sdf(pos: vec3f) -> f32 {
  var obj_idx = -1;
  var min_dist = FAR;

  for (var idx = 0u; idx < scene_info.num_of_spheres; idx++) {
    let obj_dist = ${sdf.sphere}(pos, scene_spheres[idx].xyzr.xyz, scene_spheres[idx].xyzr.w);

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
    let obj_dist = ${sdf.sphere}(pos, scene_spheres[idx].xyzr.xyz, scene_spheres[idx].xyzr.w);

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

  return normalize(vec3f(
    (xDistance - centerDistance),
    (yDistance - centerDistance),
    (zDistance - centerDistance),
  ) / epsilon);
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
  var dir = vec4f(
    (coord / vec2f(WIDTH, HEIGHT)) * 2. - 1.,
    1.,
    0.
  );

  let hspan = 1.;
  let vspan = 1.;

  dir.x *= hspan;
  dir.y *= -vspan;

  *out_pos = (view_matrix * vec4f(0, 0, 0, 1)).xyz;
  *out_dir = normalize((view_matrix * dir).xyz);
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

@compute @workgroup_size(${BlockSize}, ${BlockSize}, 1)
fn main_frag(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let lid = LocalInvocationID.xy;
  let parallel_idx = LocalInvocationID.y * ${BlockSize} + LocalInvocationID.x;

  ${setupRandomSeed}(vec2f(GlobalInvocationID.xy) + time * 0.312);

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

  march(ray_pos, ray_dir, &march_result);

  let world_normal = march_result.normal;
  let white = vec3f(1., 1., 1.);
  let mat_color = min(march_result.material.color, white);

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
import { WhiteNoiseBuffer } from '../../whiteNoiseBuffer';
import { TimeInfoBuffer } from '../timeInfoBuffer';
import {
  MarchDomainArray,
  MarchDomainKind,
  MarchDomainStruct,
} from './marchDomain';
import { Camera } from './camera';
import { roundUp } from '../mathUtils';
import { randOnHemisphere, setupRandomSeed } from '../wgslUtils/random';

type SceneInfoStruct = Parsed<typeof SceneInfoStruct>;
const SceneInfoStruct = object({
  numOfSpheres: u32,
  numOfDomains: u32,
});

type SphereStruct = Parsed<typeof SphereStruct>;
const SphereStruct = object({
  xyzr: vec4f,
  materialIdx: u32,
});
const SphereStructArray = arrayOf(SphereStruct, MAX_SPHERES);

function domainFromSphere(sphere: SphereStruct): MarchDomainStruct {
  const radius = sphere.xyzr[3];

  return {
    kind: MarchDomainKind.AABB,
    pos: [sphere.xyzr[0], sphere.xyzr[1], sphere.xyzr[2]],
    extra: [radius, radius, radius],
  };
}

export const SDFRenderer = (
  device: GPUDevice,
  gBuffer: GBuffer,
  renderQuarter: boolean,
) => {
  const LABEL = `SDF Renderer`;
  const blockDim = 8;
  const whiteNoiseBufferSize = 512 * 512;
  const mainPassSize = renderQuarter ? gBuffer.quarterSize : gBuffer.size;

  const camera = new Camera(device);

  const whiteNoiseBuffer = WhiteNoiseBuffer(
    device,
    whiteNoiseBufferSize,
    GPUBufferUsage.STORAGE,
  );

  const timeInfoBuffer = TimeInfoBuffer(device, GPUBufferUsage.UNIFORM);

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

  const sharedBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Shared Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'uniform',
        },
      },
    ],
  });

  const sceneBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Scene Bind Group Layout`,
    entries: [
      // scene_info
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // view_matrix
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // domains
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // scene_spheres
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
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

  const sharedBindGroup = device.createBindGroup({
    label: `${LABEL} - Shared Bind Group`,
    layout: sharedBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          label: `${LABEL} - White Noise Buffer`,
          buffer: whiteNoiseBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          label: `${LABEL} - Time Info`,
          buffer: timeInfoBuffer.buffer,
        },
      },
    ],
  });

  const sceneSpheres: SphereStruct[] = [
    {
      xyzr: [-0.3, 0, 1, 0.2],
      materialIdx: 1,
    },
    {
      xyzr: [0.4, 0, 1, 0.4],
      materialIdx: 0,
    },
    {
      xyzr: [0, 0.7, 1, 0.2],
      materialIdx: 2,
    },
  ];

  const domains: MarchDomainStruct[] = [];
  for (let i = 0; i < sceneSpheres.length; ++i) {
    domains.push(domainFromSphere(sceneSpheres[i]));
  }

  const sceneInfo: SceneInfoStruct = {
    numOfSpheres: sceneSpheres.length,
    numOfDomains: domains.length,
  };
  const sceneInfoBuffer = device.createBuffer({
    label: `${LABEL} - Scene Info Buffer`,
    size: roundUp(SceneInfoStruct.measure(sceneInfo).size, 16),
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    SceneInfoStruct.write(
      new BufferWriter(sceneInfoBuffer.getMappedRange()),
      sceneInfo,
    );
    sceneInfoBuffer.unmap();
  }

  const sceneSpheresBuffer = device.createBuffer({
    label: `${LABEL} - Scene Spheres Buffer`,
    size: roundUp(SphereStructArray.measure(MaxValue).size, 16),
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    const writer = new BufferWriter(sceneSpheresBuffer.getMappedRange());
    for (let i = 0; i < sceneSpheres.length; ++i) {
      SphereStruct.write(writer, sceneSpheres[i]);
    }
    sceneSpheresBuffer.unmap();
  }

  const domainsBuffer = device.createBuffer({
    label: `${LABEL} - Domains Buffer`,
    size: roundUp(MarchDomainArray.measure(MaxValue).size, 16),
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    const writer = new BufferWriter(domainsBuffer.getMappedRange());
    for (let i = 0; i < domains.length; ++i) {
      MarchDomainStruct.write(writer, domains[i]);
    }
    domainsBuffer.unmap();
  }

  const sceneBindGroup = device.createBindGroup({
    label: `${LABEL} - Scene Bind Group`,
    layout: sceneBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: sceneInfoBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: camera.gpuBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: domainsBuffer,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: sceneSpheresBuffer,
        },
      },
    ],
  });

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
      bindingGroup: 3,
      shaderStage: GPUShaderStage.COMPUTE,
    });

  const mainPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        sharedBindGroupLayout,
        mainBindGroupLayout,
        sceneBindGroupLayout,
        mainProgram.bindGroupLayout,
      ],
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
      bindingGroup: 3,
      shaderStage: GPUShaderStage.COMPUTE,
    });

  const auxPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        sharedBindGroupLayout,
        auxBindGroupLayout,
        sceneBindGroupLayout,
        auxProgram.bindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Aux Shader`,
        code: auxProgram.code,
      }),
      entryPoint: 'main_aux',
    },
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      timeInfoBuffer.update();
      camera.update();

      const mainPass = commandEncoder.beginComputePass();

      mainPass.setPipeline(mainPipeline);
      mainPass.setBindGroup(0, sharedBindGroup);
      mainPass.setBindGroup(1, mainBindGroup);
      mainPass.setBindGroup(2, sceneBindGroup);
      mainPass.setBindGroup(3, mainProgram.bindGroup);
      mainPass.dispatchWorkgroups(
        Math.ceil(mainPassSize[0] / blockDim),
        Math.ceil(mainPassSize[1] / blockDim),
        1,
      );

      mainPass.end();

      const auxPass = commandEncoder.beginComputePass();

      auxPass.setPipeline(auxPipeline);
      auxPass.setBindGroup(0, sharedBindGroup);
      auxPass.setBindGroup(1, auxBindGroup);
      auxPass.setBindGroup(2, sceneBindGroup);
      auxPass.setBindGroup(3, auxProgram.bindGroup);
      auxPass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      auxPass.end();
    },
  };
};
